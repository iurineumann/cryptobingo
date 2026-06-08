// apps/e2e-ui/cypress/e2e/tier1/player/gameroom-live.cy.ts
// Tier 1 — GameRoom AO VIVO dirigido por socket mock (ADR-007/017).
//
// Sem timers reais: cy.mockSocket() injeta um mock-socket Server que substitui o
// io() do useSlowReveal; cy.emitBall(n)/cy.emitWinner(...) controlam o slow-reveal
// manualmente. Valida: bola hero (gr-ball-hero) atualiza, histórico cresce e o
// overlay de encerramento aparece ao emitir winner.
//
// Realm: o WebSocket é "patchado" no window carregado pelo devLogin (rota /).
// Navegamos para a sala via roteamento SPA (clique no card) para PRESERVAR esse
// realm — um cy.visit faria reload e descartaria o patch do mock-socket.

const FUNDING_GAME = '1717000000000';

describe('Player · GameRoom ao vivo (socket mock)', () => {
    beforeEach(() => {
        // gameId default usado pelos eventos emitidos (cy.emitBall/emitWinner).
        Cypress.env('gameId', Number(FUNDING_GAME));
        Cypress.env('__ballOrder', 0);

        // mockSocket ANTES do devLogin: instala a classe WebSocket mock no
        // window:before:load do cy.visit inicial — o engine.io-client captura o
        // WebSocket no carregamento do bundle, então patchar depois não intercepta.
        // A navegação para a sala é client-side (sem reload) → o patch persiste.
        cy.mockSocket();
        cy.devLogin('player', 'funding');
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');

        cy.get('[data-testid="lobby-buy-1"]').click();
        cy.location('pathname', { timeout: 10_000 }).should('eq', `/room/1/${FUNDING_GAME}`);
        cy.get('[data-testid="gr-ball-hero"]', { timeout: 15_000 }).should('exist');
    });

    it('atualiza a bola hero ao emitir ball_drawn', () => {
        cy.get('[data-testid="gr-ball-hero"] .ball-number').should('contain.text', '—');
        cy.emitBall(42);
        cy.get('[data-testid="gr-ball-hero"] .ball-number', { timeout: 10_000 })
            .should('contain.text', '42');
    });

    it('cresce o histórico conforme as bolas chegam', () => {
        cy.emitBall(42);
        cy.emitBall(17);
        cy.emitBall(64);
        cy.get('[data-testid="gr-ball-history"] .gr-mini-ball', { timeout: 10_000 })
            .its('length').should('eq', 3);
    });

    it('mostra o overlay de encerramento ao emitir winner_found + game_ended', () => {
        cy.emitBall(3);
        cy.emitBall(5);
        // Vencedor com a cartela do jogador (ticket 1001 da fixture funding tickets).
        cy.emitWinner({
            winning_ball: 5,
            winners: [
                {
                    account:     'jogador1',
                    ticket_id:   '1001',
                    win_pattern: 'ROW_1',
                    payouts:     ['10.0000 BINGO'],
                },
            ],
        });
        // game_ended fecha o reveal → isGameEnded → gr-ended-overlay.
        cy.emitSocketEvent('game_ended', {
            event:   'game_ended',
            game_id: Number(FUNDING_GAME),
            payload: { draw_mode: 'standard', total_winners: 1 },
        });
        cy.get('[data-testid="gr-ended-overlay"]', { timeout: 10_000 }).should('be.visible');
    });
});

export {};
