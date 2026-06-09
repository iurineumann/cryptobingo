// apps/e2e-ui/cypress/e2e/tier1/player/gameroom-static.cy.ts
// Tier 1 — GameRoom em estado final estático, SEM WebSocket (ADR-007/010/016/017).
//
// Cenário `archived-combo-win`: jogo `archived` cujas bolas vêm de game.drawn_balls
// (caminho isStaticFinalState/fallbackBalls do GameRoom). A cartela do jogador
// completa o B-column (ROW_1) + a diagonal (DIAG_TL_BR), satisfazendo a combinação
// "Linha + Diagonal" (all_of [1,10], weight 1200 → 12×). Valida:
//   - bolas renderizadas a partir do estado on-chain (sem socket);
//   - células da cartela marcadas;
//   - painel de padrões (gr-patterns-panel);
//   - overlay de encerramento (gr-ended-overlay) com vitória;
//   - prêmio de COMBINAÇÃO no breakdown (gr-prize-breakdown), coerente com
//     ADR-010 (pricePaid 10 BINGO) × ADR-016 (combo weight 1200) = 120.0000 BINGO.

const ARCHIVED_GAME = '1716000000000';

describe('Player · GameRoom estático (archived, combo win)', () => {
    beforeEach(() => {
        cy.devLogin('player', 'archived-combo-win');
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
        // Navega para a sala do jogo encerrado via SPA (sem reload — preserva a
        // sessão de dev, que não é persistida no sessionKit).
        cy.window().then((win) => {
            win.history.pushState({}, '', `/room/1/${ARCHIVED_GAME}`);
            win.dispatchEvent(new win.PopStateEvent('popstate'));
        });
        // Bola hero existe assim que o GameRoom monta com fallbackBalls.
        cy.get('[data-testid="gr-ball-hero"]', { timeout: 15_000 }).should('exist');
    });

    it('renderiza as bolas de drawn_balls sem WebSocket', () => {
        // Histórico populado a partir do estado on-chain (fallbackBalls).
        cy.get('[data-testid="gr-ball-history"] .gr-mini-ball').its('length').should('be.gte', 8);
    });

    it('marca as células da cartela vencedora (B-column + diagonal)', () => {
        cy.get('[data-testid="gr-ticket-2001"]').should('exist');
        // Célula 0 (B0=3, sorteada) marcada; FREE (12) sempre marcado.
        cy.get('[data-testid="gr-ticket-2001"] [data-testid="tc-cell-0"]').should('have.class', 'is-marked');
        cy.get('[data-testid="gr-ticket-2001"] [data-testid="tc-cell-12"]').should('have.class', 'is-free');
    });

    it('exibe o painel de padrões', () => {
        cy.get('[data-testid="gr-patterns-panel"]').should('be.visible');
        // Pelo menos um padrão listado (gametype 1 tem 4 regras).
        cy.get('[data-testid="gr-patterns-panel"] .gr-pattern').its('length').should('be.gte', 1);
    });

    it('mostra o overlay de encerramento com vitória do jogador', () => {
        cy.get('[data-testid="gr-ended-overlay"]', { timeout: 15_000 })
            .should('be.visible')
            .and('have.class', 'gr-ended-banner--winner');
    });

    it('exibe o prêmio de COMBINAÇÃO no breakdown (ADR-010 × ADR-016)', () => {
        cy.get('[data-testid="gr-prize-breakdown"]', { timeout: 15_000 }).should('be.visible');
        // Combo "Linha + Diagonal": pricePaid 10 × weight 1200/100 = 120.0000.
        cy.get('[data-testid="gr-prize-breakdown"]').should('contain.text', '120.0000');
    });
});

export {};
