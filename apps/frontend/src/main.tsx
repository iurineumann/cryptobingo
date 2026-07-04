import * as Sentry from '@sentry/react';
import React  from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App    from './App';
import { initSentry } from './sentry';
import './i18n';
import './styles/globals.css';

initSentry();

const savedTheme  = localStorage.getItem('cb_theme');
const systemDark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialTheme = savedTheme ?? (systemDark ? 'dark' : 'light');

document.documentElement.setAttribute('data-theme', initialTheme);

function ErrorFallback() {
  return <div className="flex items-center justify-center min-h-screen text-white bg-surface-950">
    <div className="text-center">
      <h1 className="text-xl font-bold mb-2">Algo deu errado</h1>
      <p className="text-secondary">Tente recarregar a página</p>
    </div>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
            <HelmetProvider>
                <App />
            </HelmetProvider>
        </Sentry.ErrorBoundary>
    </React.StrictMode>
);
