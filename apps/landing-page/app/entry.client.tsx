import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { injectGTM, injectCookieConsent } from './inject-scripts.client';

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});

// Scripts de terceiros injetados fora da árvore React (document.createElement).
// Não causam erro de hidratação #418 no React Router v7.
injectGTM();
injectCookieConsent();
