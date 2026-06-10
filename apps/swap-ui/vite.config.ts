/// <reference types="vitest" />

import { defineConfig } from 'vite';
import react            from '@vitejs/plugin-react';
import tailwindcss      from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    plugins: [
        tailwindcss(),
        react(),
        nodePolyfills({
            include: ['buffer', 'crypto', 'stream', 'util'],
            globals: { Buffer: true, global: true, process: true },
        }),
    ],
    test: {
        environment: 'jsdom',
        globals:     true,
        include:     ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        setupFiles:  ['./src/vitest.setup.ts'],
    },
    server: {
        port: 5174,  // porta diferente do game frontend (5173)
        historyApiFallback: true,
        proxy: {
            '/v1': {
                target:       'http://127.0.0.1:8888',
                changeOrigin: true,
            },
            '/api': {
                target:       'http://127.0.0.1:8083',
                changeOrigin: true,
            },
        },
    },
});
