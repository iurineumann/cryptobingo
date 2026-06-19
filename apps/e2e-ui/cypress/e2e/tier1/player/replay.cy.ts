// apps/e2e-ui/cypress/e2e/tier1/player/replay.cy.ts
// Tier 1 — Replay de partida encerrada (ADR-007, ADR-017).
// Cobre: loading, tela principal, botões, seek, tickets.

function spaNavigate(path: string) {
    cy.window().then((win) => {
        win.history.pushState({}, '', path);
        win.dispatchEvent(new PopStateEvent('popstate'));
    });
}

describe('Player · ReplayRoom', () => {
    beforeEach(() => {
        cy.devLogin('player', 'funding');
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
        cy.intercept('POST', '**/v1/chain/get_table_rows', (req) => {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (body.table === 'games' && body.lower_bound === '1717000000000') {
                req.reply({ body: { rows: [{
                    game_id: '1717000000000', room_id: '1', status: 'completed',
                    start_time: Math.floor(Date.now() / 1000) - 7200,
                    end_time: Math.floor(Date.now() / 1000) - 3600,
                    ticket_price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
                    total_wagered: { quantity: '800.0000 BINGO', contract: 'bingogametkn' },
                    drawn_balls: [5, 12, 23, 34, 45, 56, 61, 72, 3, 18, 29, 40, 51, 62, 73, 8, 19, 30, 41, 52],
                    stage: 0, total_players: 8,
                    golden_ball_num: 61,
                    golden_multiplier: 3,
                    total_paid: 0, sponsor_pool: [], campaign_id: '0', gametype_id: '0',
                }], more: false, next_key: '' }});
            } else if (body.table === 'tickets') {
                req.reply({ body: { rows: [
                    { ticket_id: 't1', game_id: '1717000000000', owner: 'player1',
                      price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' } },
                    { ticket_id: 't2', game_id: '1717000000000', owner: 'player1',
                      price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' } },
                ], more: false, next_key: '' }});
            } else {
                req.reply({ body: { rows: [], more: false, next_key: '' } });
            }
        }).as('getTableRows');
        cy.intercept('POST', '**/v1/chain/get_account', { body: { core_liquid_balance: '10.00000000 WAX' } }).as('getAccount');
        spaNavigate('/replay/1717000000000');
    });

    it('carrega e exibe tela do replay', () => {
        cy.get('[data-testid="replay-page"]', { timeout: 15_000 }).should('be.visible');
    });

    it('exibe botão voltar', () => {
        cy.get('[data-testid="replay-back-btn"]').should('be.visible');
    });

    it('exibe controles de reprodução', () => {
        cy.get('[data-testid="replay-play-btn"]').should('be.visible');
        cy.get('[data-testid="replay-restart-btn"]').should('exist');
        cy.get('[data-testid="replay-end-btn"]').should('exist');
    });

    it('exibe botões de velocidade', () => {
        cy.get('[data-testid="replay-speed-1"]').should('be.visible');
        cy.get('[data-testid="replay-speed-2"]').should('exist');
        cy.get('[data-testid="replay-speed-8"]').should('exist');
    });

    it('exibe banner golden ball quando presente', () => {
        cy.get('[data-testid="replay-golden-banner"]', { timeout: 10_000 }).should('be.visible');
    });
});

export {};
