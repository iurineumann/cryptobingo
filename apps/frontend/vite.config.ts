// apps/frontend/vite.config.ts
/// <reference types="vitest" />

import { defineConfig, loadEnv } from 'vite';
import react                     from '@vitejs/plugin-react';
import tailwindcss               from '@tailwindcss/vite';
import { nodePolyfills }         from 'vite-plugin-node-polyfills';
import { VitePWA }               from 'vite-plugin-pwa';
import path                      from 'path';

export default defineConfig(({ mode }) => {
    const env    = loadEnv(mode, process.cwd(), '');
    const rpcUrl = env.VITE_RPC_URL         || 'http://127.0.0.1:8888';
    const apiUrl = env.VITE_API_GATEWAY_URL || 'http://127.0.0.1:8083';
    const wsUrl  = env.VITE_WS_URL_INTERNAL || 'http://127.0.0.1:8085';

    return {
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        plugins: [
            tailwindcss(),    // Tailwind v4 — deve vir ANTES do react plugin
            react(),
            nodePolyfills({
                include: ['buffer', 'crypto', 'stream', 'util'],
                globals: { Buffer: true, global: true, process: true },
            }),
            VitePWA({
                registerType:  'autoUpdate',
                injectRegister: 'auto',
                workbox: {
                    // Estratégia cache-first para assets estáticos
                    globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
                    // Não cachear chamadas à blockchain ou API (dados ao vivo)
                    navigateFallback: '/index.html',
                    navigateFallbackDenylist: [/^\/v1/, /^\/api/, /^\/socket\.io/],
                    runtimeCaching: [
                        {
                            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
                            handler:    'StaleWhileRevalidate',
                            options:    { cacheName: 'google-fonts-stylesheets' },
                        },
                        {
                            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
                            handler:    'CacheFirst',
                            options:    { cacheName: 'google-fonts-webfonts', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } },
                        },
                    ],
                },
                manifest: {
                    name:             'CryptoBingo',
                    short_name:       'CryptoBingo',
                    description:      'Bingo on-chain, provably fair — sorteio verificável via oráculo WAX.',
                    theme_color:      '#6d28d9',
                    background_color: '#0f0c1a',
                    display:          'standalone',
                    orientation:      'portrait',
                    start_url:        '/',
                    scope:            '/',
                    lang:             'pt-BR',
                    icons: [
                        { src: '/brand/app-icon-192.png', sizes: '192x192', type: 'image/png' },
                        { src: '/brand/app-icon-512.png', sizes: '512x512', type: 'image/png' },
                        { src: '/brand/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                    ],
                    categories: ['games', 'entertainment', 'finance'],
                    screenshots: [],
                },
            }),
        ],
        test: {
            environment:  'jsdom',
            globals:      true,
            include:      ['src/**/*.test.ts', 'src/**/*.test.tsx'],
            setupFiles:   ['./src/vitest.setup.ts'],
            // shared-types só emite .d.ts (emitDeclarationOnly). Alias aponta para source TS
            // para que vitest possa transformar e eraser as importações de tipo em runtime.
            alias: {
                '@cryptobingo/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
            },
            coverage: {
                provider:   'v8',
                include:    ['src/**/*.ts', 'src/**/*.tsx'],
                exclude:    ['src/main.tsx', 'src/i18n.ts', 'src/**/*.d.ts', 'src/vitest.setup.ts'],
                thresholds: { branches: 50, functions: 60, lines: 60, statements: 60 },
            },
        },
        server: {
            historyApiFallback: true, // serve index.html para todas as rotas SPA (ADR-015)
            proxy: {
                '/v1': {
                    target:       rpcUrl,
                    changeOrigin: true,
                },
                '/api': {
                    target:       apiUrl,
                    changeOrigin: true,
                },
                '/socket.io': {
                    target:       wsUrl,
                    changeOrigin: true,
                    ws:           true,
                },
            },
        },
    };
});
