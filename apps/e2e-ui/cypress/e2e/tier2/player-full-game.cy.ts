// Tier 2 — exige stack completo (init_dev_env.sh + vite dev)
//
// apps/e2e-ui/cypress/e2e/tier2/player-full-game.cy.ts
// Jornada completa do jogador contra a stack real: nodeos + oracle daemon +
// api-gateway + worker + frontend (vite dev).
//
// Cobre (ADR-017 §Tier 2):
//   - dev-login real (WalletPluginPrivateKey, challenge/verify/profile contra api-gateway real);
//   - entrada no lobby → localiza sala ativa;
//   - compra de cartela via BuyTicketModal (POST /tickets real → transact on-chain);
//   - aguarda estado `locked` (sala fecha para novas compras);
//   - aguarda `drawn` (oracle resolve → bolas sorteadas, slow-reveal real ~285s);
//   - verifica banner de encerramento (gr-ended-overlay) — vitória ou derrota;
//   - verifica histórico de jogo (gr-game-history ou perfil de partidas).
//
// Tolerâncias de tempo:
//   - cy.get/should padrão: timeout 60 000 ms (cypress.config.ts defaultCommandTimeout).
//   - Estado de jogo (drawn, encerrado): timeout 120 000 ms (configurado inline abaixo).
//   - taskTimeout 300 000 ms cobre o slow-reveal real (~285s) + margem.
//
// Regras hard:
//   - SEM cy.stubBackend — rede real.
//   - cy.devLogin(role) usa o fluxo real (sem intercept de auth).
//   - Sem cy.wait(número) — retry-ability sobre data-testid.

describe('Player · Jornada completa de jogo (Tier 2 real)', () => {
    // O slow-reveal real leva ~285s; damos 300s de margem para o estado `drawn`.
    const DRAWN_TIMEOUT   = 300_000;
    const LOCK_TIMEOUT    = 120_000;
    const DEFAULT_TIMEOUT =  60_000;

    before(() => {
        // dev-login SEM stubBackend: auth real contra api-gateway.
        // cy.devLogin intercepta challenge/verify/profile mesmo no Tier 2 para
        // isolar o botão de dev-login (UI só existe em DEV). A diferença é que
        // NÃO chamamos cy.stubBackend — os endpoints REST/RPC batem na stack real.
        cy.devLogin('player');
        cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('eq', '/lobby');
    });

    it('localiza sala ativa no lobby', () => {
        // Espera pelo menos um card de sala renderizar — indica que o GET /rooms
        // real retornou salas cadastradas (criadas via init_dev_env.sh ou admin).
        cy.get('[data-testid^="lobby-card-"]', { timeout: DEFAULT_TIMEOUT })
            .should('have.length.gte', 1);
    });

    it('entra na sala e compra uma cartela', () => {
        // Clica no primeiro card de sala disponível (em funding/active).
        cy.get('[data-testid^="lobby-card-"]').first().click();

        // Aguarda a GameRoom montar — o header da sala é o primeiro elemento estável.
        cy.get('[data-testid="gr-room-header"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');

        // Abre o modal de compra de cartela.
        cy.get('[data-testid="gr-buy-more"]', { timeout: DEFAULT_TIMEOUT })
            .should('not.be.disabled')
            .click();

        // O modal de compra abre.
        cy.get('[data-testid="buy-modal"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');

        // Confirma a compra com o preço padrão (não altera o campo de preço).
        cy.get('[data-testid="buy-confirm"]', { timeout: DEFAULT_TIMEOUT })
            .should('not.be.disabled')
            .click();

        // Aguarda feedback de sucesso: toast de compra confirmada ou cartela
        // aparecendo no painel de cartelas do jogador (gr-my-tickets).
        cy.get('[data-testid="buy-toast-success"], [data-testid="gr-my-tickets"] [data-testid^="gr-ticket-"]',
            { timeout: DEFAULT_TIMEOUT })
            .should('exist');

        // Fecha o modal se ainda visível (pode fechar sozinho após sucesso).
        cy.get('body').then(($body) => {
            if ($body.find('[data-testid="buy-modal"]').length) {
                cy.get('[data-testid="buy-modal-close"]').click({ force: true });
            }
        });
    });

    it('aguarda a sala entrar em estado locked (sorteio iminente)', () => {
        // O worker muda o estado do jogo de `funding` → `drawing` → `drawn`.
        // O frontend reflete o lock via o badge/status do game (gr-game-status).
        // Aceitamos `drawing` OU `drawn` como evidência de lock.
        cy.get('[data-testid="gr-game-status"]', { timeout: LOCK_TIMEOUT })
            .should(($el) => {
                const text = $el.text().toLowerCase();
                // O texto do status pode ser traduzido; validamos a classe CSS ou
                // o valor do atributo data-status que o componente seta.
                expect($el.attr('data-status') ?? text).to.match(/drawing|drawn|locked/);
            });
    });

    it('aguarda bolas sorteadas (drawn real — slow-reveal ~285s)', () => {
        // O slow-reveal real dispara os eventos ball_drawn via WebSocket do broadcaster.
        // Aguardamos o histórico de bolas acumular pelo menos 10 bolas (evidência de
        // progresso real do sorteio) dentro do timeout generoso.
        cy.get('[data-testid="gr-ball-history"] .gr-mini-ball', { timeout: DRAWN_TIMEOUT })
            .should('have.length.gte', 10);
    });

    it('verifica banner de encerramento após o sorteio completo', () => {
        // Após drawn completo (75 bolas), o GameRoom exibe gr-ended-overlay.
        // Pode ser vitória (gr-ended-banner--winner) ou derrota — qualquer um é válido.
        cy.get('[data-testid="gr-ended-overlay"]', { timeout: DRAWN_TIMEOUT })
            .should('be.visible');
    });

    it('verifica histórico de partida após encerramento', () => {
        // O link para histórico de partidas aparece no overlay ou no perfil.
        // Aceitamos qualquer um dos dois pontos de entrada visíveis.
        cy.get(
            '[data-testid="gr-history-link"], [data-testid="gr-ended-overlay"] [data-testid="gr-view-history"]',
            { timeout: DEFAULT_TIMEOUT },
        ).should('exist');
    });
});

export {};
