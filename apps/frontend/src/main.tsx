// apps/frontend/src/main.tsx

import React  from 'react';
import ReactDOM from 'react-dom/client';
import App    from './App';
import './i18n';
import './styles/globals.css';

// ── Tema inicial ─────────────────────────────────────────────────────────────
// Lê a preferência salva, com fallback para prefers-color-scheme do sistema.
// O atributo data-theme no <html> é a única fonte de verdade para o tema.
const savedTheme  = localStorage.getItem('cb_theme');
const systemDark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialTheme = savedTheme ?? (systemDark ? 'dark' : 'light');

document.documentElement.setAttribute('data-theme', initialTheme);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
