import { useEffect, useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type EventParams = Record<string, string | number | boolean | undefined>;

const GA4_MEASUREMENT_ID = 'G-BLQRZ64RES';
const PROXY_URL = '/api/v1/analytics/event';

const PROBE_URL = 'https://www.google-analytics.com/gtag/js?id=' + GA4_MEASUREMENT_ID;

let adblockDetected: boolean | null = null;

async function detectAdblock(): Promise<boolean> {
  try {
    const res = await fetch(PROBE_URL, { method: 'HEAD', mode: 'no-cors' });
    return false;
  } catch {
    return true;
  }
}

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match?.[2];
}

function gtag(...args: unknown[]) {
  if (typeof window.dataLayer !== 'undefined') {
    window.dataLayer.push(args);
  }
}

export function useAnalytics() {
  const location = useLocation();
  const prevPath = useRef(location.pathname);
  const [adblock, setAdblock] = useState(false);

  useEffect(() => {
    if (adblockDetected === null) {
      detectAdblock().then(detected => {
        adblockDetected = detected;
        setAdblock(detected);
        if (detected) console.info('[Analytics] Adblock detectado — usando proxy server-side.');
      });
    } else {
      setAdblock(adblockDetected);
    }
  }, []);

  const trackEvent = useCallback((
    eventName: string,
    params?: EventParams,
    forceProxy?: boolean,
  ) => {
    const useProxy = forceProxy ?? adblock;

    const payload = {
      event: eventName,
      ...params,
      send_to: GA4_MEASUREMENT_ID,
      page_location: window.location.href,
      page_title: document.title,
      language: navigator.language,
      user_agent: navigator.userAgent.slice(0, 200),
      client_id: getCookie('_ga') ?? undefined,
    };

    if (useProxy) {
      const body = JSON.stringify({ ...payload, client_id: payload.client_id ?? 'cryptobingo-client' });
      navigator.sendBeacon?.(PROXY_URL, body)
        ?? fetch(PROXY_URL, { method: 'POST', body, keepalive: true }).catch(() => {});
    } else {
      gtag('event', eventName, params);
    }
  }, [adblock]);

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname;
      trackEvent('page_view', {
        page_path: location.pathname,
        page_search: location.search,
      });
    }
  }, [location, trackEvent]);

  return { trackEvent };
}
