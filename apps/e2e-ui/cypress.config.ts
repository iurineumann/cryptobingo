// apps/e2e-ui/cypress.config.ts
// Configuração do Cypress para a suíte E2E de UI (ADR-017).
//
// Estratégia em camadas via `--env tier`:
//   tier=1 → specs determinísticos (cy.intercept + fixtures, sem WAX) — PR-gate.
//   tier=2 → specs contra o stack real (docker compose + init_dev_env) — nightly.
//   tier=3 → fluxos reais completos: auth real (cy.realDevLogin), JWT real, sem mocks.
//
// O `specPattern` é resolvido a partir de `config.env.tier` (default 1), de modo
// que `cypress run --env tier=2` troque o conjunto de specs sem duplicar config.

import { defineConfig } from 'cypress';

export default defineConfig({
    e2e: {

        // O `vite dev` serve o frontend na 5173 com import.meta.env.DEV=true,
        // condição necessária para a UI de dev-login (5 perfis) existir.
        // IMPORTANTE: usar `localhost` e não `127.0.0.1` — o api-gateway tem CORS
        // restrito a `http://localhost:5173` (ALLOWED_ORIGINS). Com 127.0.0.1 o
        // browser envia Origin diferente e o auth falha silenciosamente.
        baseUrl: 'http://localhost:5173',

        // Localmente não gravamos vídeo (lento); screenshots em falha bastam para triage.
        video: false,
        screenshotOnRunFailure: true,

        // Tier 1 é determinístico, mas a borda de rede/animação pode ter flutuação
        // pontual em CI — 2 retries no modo run; 0 no runner interativo (debug limpo).
        retries: { runMode: 2, openMode: 0 },

        // WSL2: desabilita GPU rendering para evitar renderer crash no Electron headless.
        chromeWebSecurity: false,

        setupNodeEvents(on, config) {
            // O tier vem por `--env tier=N`; default 1 (PR-gate determinístico).
            const tier = Number(config.env.tier ?? 1);

            config.specPattern =
                tier === 3
                    ? 'cypress/e2e/tier3/**/*.cy.ts'
                    : tier === 2
                    ? 'cypress/e2e/tier2/**/*.cy.ts'
                    : 'cypress/e2e/tier1/**/*.cy.ts';

            // Tier 3 — testes stateful contra chain real: sem retries e sem isolamento
            // entre testes. testIsolation:false preserva sessionStorage (JWT) entre
            // `it` blocks do mesmo describe, permitindo que `before` hooks de auth
            // funcionem sem re-login a cada teste.
            if (tier === 3) {
                config.retries = { runMode: 0, openMode: 0 };
                config.testIsolation = false;
            }

            // Flags Chrome para WSL2 headless: evita crash do renderer por falta de GPU.
            on('before:browser:launch', (browser, launchOptions) => {
                if (browser.name === 'electron' || browser.family === 'chromium') {
                    launchOptions.args.push(
                        '--disable-gpu',
                        '--disable-software-rasterizer',
                        '--disable-dev-shm-usage',
                    );
                }
                return launchOptions;
            });

            // Retornar a config mutada é obrigatório quando alteramos specPattern aqui.
            return config;
        },
    },
});
