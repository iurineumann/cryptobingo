// apps/frontend/vite.config.ts

import { defineConfig, loadEnv } from 'vite';
import react                     from '@vitejs/plugin-react';
import tailwindcss               from '@tailwindcss/vite';
import { nodePolyfills }         from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
    const env    = loadEnv(mode, process.cwd(), '');
    const rpcUrl = env.VITE_RPC_URL         || 'http://127.0.0.1:8888';
    const apiUrl = env.VITE_API_GATEWAY_URL || 'http://127.0.0.1:8083';
    const wsUrl  = env.VITE_WS_URL_INTERNAL || 'http://127.0.0.1:8085';

    return {
        plugins: [
            tailwindcss(),    // Tailwind v4 — deve vir ANTES do react plugin
            react(),
            nodePolyfills({
                include: ['buffer', 'crypto', 'stream', 'util'],
                globals: { Buffer: true, global: true, process: true },
            }),
        ],
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
