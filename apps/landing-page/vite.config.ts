import { defineConfig, loadEnv } from 'vite';
import { configDefaults }        from 'vitest/config';
import { reactRouter }          from '@react-router/dev/vite';
import tailwindcss              from '@tailwindcss/vite';
import react                    from '@vitejs/plugin-react';
import { visualizer }           from 'rollup-plugin-visualizer';
import path                     from 'node:path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const isVitest = !!process.env.VITEST;
    const visualize = !!process.env.VISUALIZE;

    const plugins = [
        tailwindcss(),
        isVitest ? react() : reactRouter(),
    ];

    if (visualize) {
        plugins.push(
            visualizer({
                filename: 'bundle-reports/stats.html',
                template: 'treemap',
                gzipSize: true,
                brotliSize: true,
                open: false,
            }),
        );
    }

    return {
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
            dedupe: ['react-router'],
        },
        plugins,
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: ['./src/test-setup.ts'],
            // `api/` é sub-pacote deploy SEPARADO (Azure Functions shim, jest próprio,
            // NÃO listado no pnpm-workspace). Excluído da varredura do vitest da raiz
            // para evitar falsos failures (resolve 'nodemailer' que só existe em api/node_modules).
            // Mantém os defaults (node_modules/dist) via configDefaults.
            exclude: [...configDefaults.exclude, 'api/**'],
        },
        build: {
            target: 'es2022',
        },
        server: {
            port: parseInt(env.PORT || '5173'),
        },
    };
});
