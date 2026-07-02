/// <reference types="vitest" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
    plugins: [tailwindcss(), react()],
    resolve: {
        alias: { '@': resolve(__dirname, 'src') },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        setupFiles: ['./src/vitest.setup.ts'],
    },
    server: {
        port: 5175,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:4280',
                changeOrigin: true,
            },
        },
    },
});
