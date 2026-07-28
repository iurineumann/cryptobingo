import { useEffect, useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { setAdblockDetected, trackEvent as trackEventService, getClientId } from '~/services/analytics';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    _analyticsConsented?: boolean;
    CookieConsent?: {
      setLanguage: (lang: string) => void;
      getLanguage?: () => string;
    };
  }
}

type EventParams = Record<string, string | number | boolean | undefined>;

const GA4_MEASUREMENT_ID = 'G-BLQRZ64RES';
const PROBE_URL = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_MEASUREMENT_ID;

let adblockCached: boolean | null = null;

async function detectAdblock(): Promise<boolean> {
  try {
    await fetch(PROBE_URL, { method: 'HEAD', mode: 'no-cors' });
    return false;
  } catch {
    return true;
  }
}

export function useAnalytics() {
  const location = useLocation();
  const prevPath = useRef(location.pathname);
  const [adblock, setAdblock] = useState(false);

  useEffect(() => {
    if (adblockCached === null) {
      detectAdblock().then(detected => {
        adblockCached = detected;
        setAdblock(detected);
        setAdblockDetected(detected);
        if (detected) console.info('[Analytics] Adblock detectado — usando proxy server-side.');
      });
    } else {
      setAdblock(adblockCached);
      setAdblockDetected(adblockCached);
    }
  }, []);

  const trackEvent = useCallback((
    eventName: string,
    params?: EventParams,
    forceProxy?: boolean,
  ) => {
    const useProxy = forceProxy ?? adblock;

    if (useProxy) {
      setAdblockDetected(true);
    }

    const enriched = {
      ...params,
      send_to: GA4_MEASUREMENT_ID,
      page_location: globalThis.location.href,
      page_title: document.title,
      language: navigator.language,
      user_agent: navigator.userAgent.slice(0, 200),
    };

    trackEventService(eventName, enriched);
  }, [adblock]);

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname;
      if (window._analyticsConsented) {
        window.dataLayer?.push({
          event: 'page_view',
          page_path: location.pathname,
          page_title: document.title,
        });
      }
      // adblock: dataLayer/GTM pode estar bloqueado → manda page_view pelo proxy
      if (adblock) {
        trackEventService('page_view', {
          page_path: location.pathname,
          page_title: document.title,
          client_id: getClientId(),
        });
      }
    }
  }, [location, adblock]);

  return { trackEvent };
}
