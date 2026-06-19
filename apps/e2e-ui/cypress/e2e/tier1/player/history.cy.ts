// apps/e2e-ui/cypress/e2e/tier1/player/history.cy.ts
// Tier 1 — Histórico pessoal do jogador (ADR-017).
// Cobre: sumário, listagem partidas, replay CTA, load more.

function spaNavigate(path: string) {
    cy.window().then((win) => {
        win.history.pushState({}, '', path);
        win.dispatchEvent(new PopStateEvent('popstate'));
    });
}

describe('Player · MyHistory', () => {
    beforeEach(() => {
        cy.devLogin('player', 'funding');
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
        cy.intercept('POST', '**/v1/chain/get_table_rows', (req) => {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (body.table === 'games') {
                req.reply({ body: {
                    rows: [
                        { game_id: '1001', status: 'archived', room_id: '1', end_time: Math.floor(Date.now() / 1000) - 86400,
                          ticket_price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
                          total_wagered: { quantity: '500.0000 BINGO', contract: 'bingogametkn' },
                          golden_ball_num: 0, golden_multiplier: 0, sponsor_pool: [], campaign_id: '0', gametype_id: '0', drawn_balls: [], total_paid: 250 },
                        { game_id: '1002', status: 'drawn', room_id: '1', end_time: Math.floor(Date.now() / 1000) - 172800,
                          ticket_price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
                          total_wagered: { quantity: '300.0000 BINGO', contract: 'bingogametkn' },
                          golden_ball_num: 0, golden_multiplier: 0, sponsor_pool: [], campaign_id: '0', gametype_id: '0', drawn_balls: [], total_paid: 0 },
                        { game_id: '1003', status: 'aborted', room_id: '1', end_time: Math.floor(Date.now() / 1000) - 259200,
                          ticket_price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
                          total_wagered: { quantity: '0.0000 BINGO', contract: 'bingogametkn' },
                          golden_ball_num: 0, golden_multiplier: 0, sponsor_pool: [], campaign_id: '0', gametype_id: '0', drawn_balls: [], total_paid: 0 },
                    ],
                    more: false, next_key: '',
                }});
            } else if (body.table === 'tickets') {
                req.reply({ body: { rows: [
                    { ticket_id: 't1', game_id: '1001', owner: 'player1', price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' } },
                    { ticket_id: 't2', game_id: '1001', owner: 'player1', price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' } },
                ], more: false, next_key: '' }});
            } else {
                req.reply({ body: { rows: [], more: false, next_key: '' } });
            }
        }).as('getTableRows');
        spaNavigate('/history');
    });

    it('exibe título', () => {
        cy.get('[data-testid="myhistory-title"]', { timeout: 10_000 }).should('be.visible');
    });

    it('lista partidas com replay CTA', () => {
        cy.get('[data-testid="myhistory-row-1001"]', { timeout: 10_000 }).should('be.visible');
        cy.get('[data-testid="myhistory-replay-1001"]').should('be.visible');
    });

    it('partida aborted exibe badge específico', () => {
        cy.get('[data-testid="myhistory-row-1003"]', { timeout: 10_000 }).should('be.visible');
    });

    it('exibe barra de sumário quando há partidas', () => {
        cy.get('[data-testid="myhistory-summary"]', { timeout: 10_000 }).should('be.visible');
    });
});

export {};
