// apps/e2e-ui/cypress/e2e/tier1/player/news.cy.ts
// Tier 1 — Página pública de News/Promoções (ADR-024, ADR-017).
// Rota pública — sem auth. Seletores SOMENTE por data-testid.

describe('Player · News', () => {
    beforeEach(() => {
        cy.intercept('GET', '**/api/v1/news*', { fixture: 'news.json' }).as('news');
        cy.visit('/news');
        cy.wait('@news');
    });

    it('exibe título da página', () => {
        cy.get('[data-testid="news-title"]').should('be.visible');
    });

    it('lista os 2 itens da fixture', () => {
        cy.get('[data-testid="news-item-n001"]').should('be.visible');
        cy.get('[data-testid="news-item-n002"]').should('be.visible');
    });

    it('1º item é pinned — badge aparece', () => {
        cy.get('[data-testid="news-pinned-n001"]').should('be.visible');
    });

    it('2º item não é pinned — sem badge', () => {
        cy.get('[data-testid="news-pinned-n002"]').should('not.exist');
    });

    it('exibe título e conteúdo do 1º item', () => {
        cy.get('[data-testid="news-heading-n001"]').should('contain.text', 'Grande Torneio');
        cy.get('[data-testid="news-content-n001"]').should('contain.text', 'torneio');
    });

    it('botão load more não aparece (total = itens carregados)', () => {
        cy.get('[data-testid="news-load-more"]').should('not.exist');
    });
});

describe('Player · News — paginação', () => {
    it('botão load more aparece e carrega mais itens quando total > itens', () => {
        // Primeira chamada: 1 item, total 2 → deve aparecer "load more"
        // Segunda chamada: 2º item
        cy.intercept('GET', '**/api/v1/news*', (req) => {
            const url = new URL(req.url);
            const offset = Number(url.searchParams.get('offset') ?? 0);
            if (offset === 0) {
                req.reply({
                    body: {
                        items: [{
                            id: 'n001', title: 'Item 1', content: 'Conteúdo 1', image_url: null,
                            locale_overrides: {}, active: true, pinned: false,
                            published_at: '2026-01-01T00:00:00Z', published_by: 'admin1',
                        }],
                        total: 2,
                        cached_at: '2026-01-01T00:00:00Z',
                    },
                });
            } else {
                req.reply({
                    body: {
                        items: [{
                            id: 'n002', title: 'Item 2', content: 'Conteúdo 2', image_url: null,
                            locale_overrides: {}, active: true, pinned: false,
                            published_at: '2026-01-01T00:00:00Z', published_by: 'admin1',
                        }],
                        total: 2,
                        cached_at: '2026-01-01T00:00:00Z',
                    },
                });
            }
        }).as('newsPaged');

        cy.visit('/news');
        cy.wait('@newsPaged');

        cy.get('[data-testid="news-load-more"]').should('be.visible').click();
        cy.wait('@newsPaged');

        cy.get('[data-testid="news-item-n001"]').should('be.visible');
        cy.get('[data-testid="news-item-n002"]').should('be.visible');
    });
});

describe('Player · News — estado de erro', () => {
    it('exibe mensagem de erro quando API falha', () => {
        cy.intercept('GET', '**/api/v1/news*', { statusCode: 503, body: { error: 'indisponível' } }).as('newsErr');
        cy.visit('/news');
        cy.wait('@newsErr');

        cy.get('[data-testid="news-error"]').should('be.visible');
    });
});

describe('Player · News — estado vazio', () => {
    it('exibe mensagem de vazio quando não há publicações', () => {
        cy.intercept('GET', '**/api/v1/news*', {
            body: { items: [], total: 0, cached_at: '2026-01-01T00:00:00Z' },
        }).as('newsEmpty');

        cy.visit('/news');
        cy.wait('@newsEmpty');

        cy.get('[data-testid="news-empty"]').should('be.visible');
    });
});

export {};
