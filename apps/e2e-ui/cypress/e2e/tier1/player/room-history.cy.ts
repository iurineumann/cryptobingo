// apps/e2e-ui/cypress/e2e/tier1/player/room-history.cy.ts
// Tier 1 — Histórico público de sala (ADR-015, ADR-017).
// Cobre: título, listagem, sumário lifetime, replay, load more.

describe('Player · RoomHistory', () => {
    beforeEach(() => {
        cy.intercept('POST', '**/v1/chain/get_table_rows', (req) => {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (body.table === 'games' && body.code !== 'bingogamectr') {
                req.reply({ body: { rows: [], more: false, next_key: '' } });
                return;
            }
            if (body.table === 'games') {
                // FETCH_BATCH=50 rows p/ manter allLoaded=false com more:true
                const rows = Array.from({ length: 50 }, (_, i) => ({
                    game_id: String(2001 + i),
                    status: 'archived', room_id: '1',
                    end_time: Math.floor(Date.now() / 1000) - 3600 * (i + 1),
                    ticket_price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
                    total_wagered: { quantity: '1000.0000 BINGO', contract: 'bingogametkn' },
                    golden_ball_num: 0, golden_multiplier: 0,
                    sponsor_pool: [], campaign_id: '0', gametype_id: '0',
                    drawn_balls: [], total_paid: 0,
                }));
                req.reply({ body: { rows, more: true, next_key: '2000' } });
            } else {
                req.reply({ body: { rows: [], more: false, next_key: '' } });
            }
        }).as('getTableRows');
        cy.visit('/room/1/history');
    });

    it('exibe título da sala', () => {
        cy.get('[data-testid="room-history-title"]', { timeout: 10_000 }).should('be.visible');
    });

    it('botão voltar existe', () => {
        cy.get('[data-testid="room-history-back"]').should('be.visible');
    });

    it('lista partidas com replay', () => {
        cy.get('[data-testid="room-history-row-2001"]', { timeout: 10_000 }).should('be.visible');
        cy.get('[data-testid="room-history-replay-2001"]').should('be.visible');
    });

    it('exibe sumário lifetime', () => {
        cy.get('[data-testid="room-history-summary"]', { timeout: 10_000 }).should('be.visible');
    });

    it('load more visível quando há mais partidas', () => {
        cy.get('[data-testid="room-history-load-more"]').should('exist');
    });
});
