declare global {
  interface Window {
    dataLayer?: unknown[];
    _analyticsConsented?: boolean;
  }
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!window._analyticsConsented || !window.dataLayer) return;
  window.dataLayer.push({ event: name, ...params });
}
