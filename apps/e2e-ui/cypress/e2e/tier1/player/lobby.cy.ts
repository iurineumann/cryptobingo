// apps/e2e-ui/cypress/e2e/tier1/player/lobby.cy.ts
// Tier 1 — Lobby do JOGADOR no cenário `funding` (ADR-010, ADR-017).
//
// Valida o card de sala vendável: identidade, status/countdown, e os CTAs
// (comprar / histórico) levando ao destino certo. Seletores SÓ por data-testid.

describe('Player · Lobby (funding)', () => {
    beforeEach(() => {
        // Cenário aplicado DENTRO do devLogin (sobrescreve o RPC vazio antes do visit).
        cy.devLogin('player', 'funding');
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
    });

    it('lista a sala em funding com status e countdown', () => {
        cy.get('[data-testid="lobby-card-1"]').should('be.visible');
        // Status badge da partida atual (funding → emoji + label traduzido).
        cy.get('[data-testid="lobby-status-1"]').should('exist');
        // Ticker de countdown só aparece em funding com tempo restante.
        cy.get('[data-testid="lobby-ticker-1"]').should('exist');
    });

    it('expõe o botão de comprar cartelas na sala em funding', () => {
        // canBuy = displayStatus funding && onEnterRoom → lobby-buy-{id}.
        cy.get('[data-testid="lobby-buy-1"]').should('be.visible');
    });

    it('botão comprar navega para a sala /room/:roomId/:gameId', () => {
        cy.get('[data-testid="lobby-buy-1"]').click();
        // game_id da fixture game.funding.json.
        cy.location('pathname', { timeout: 10_000 })
            .should('eq', '/room/1/1717000000000');
    });

    it('botão histórico navega para /room/:roomId/history', () => {
        cy.get('[data-testid="lobby-history-1"]').click();
        cy.location('pathname', { timeout: 10_000 }).should('eq', '/room/1/history');
    });
});

export {};
