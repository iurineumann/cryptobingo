import { defineConfig, loadEnv } from 'vite';
import { reactRouter }          from '@react-router/dev/vite';
import tailwindcss              from '@tailwindcss/vite';
import path                     from 'node:path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    return {
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
            dedupe: ['react-router'],
        },
        plugins: [
            tailwindcss(),
            reactRouter(),
        ],
        build: {
            target: 'es2022',
        },
        server: {
            port: parseInt(env.PORT || '5173'),
        },
    };
});
