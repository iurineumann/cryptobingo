// apps/e2e-ui/cypress/e2e/tier1/player/i18n.cy.ts
// Tier 1 — troca de idioma na LandingPage (ADR-017).
//
// O seletor lang-select (LandingPage) expõe lang-opt-pt/en/zh. Validamos a
// re-renderização por data-testid e por estado (aria-pressed) — NUNCA asserindo
// texto traduzido como seletor. Para provar que a UI mudou, comparamos o TEXTO do
// CTA do hero (landing-connect) entre locales: ele deve diferir após a troca.

describe('Player · i18n (troca de idioma)', () => {
    beforeEach(() => {
        // A LandingPage (rota /) tem o seletor com testids; sem login necessário.
        // stubBackend evita chamadas de rede penduradas durante o carregamento.
        cy.stubBackend('funding');
        cy.visit('/');
        cy.get('[data-testid="lang-select"]', { timeout: 15_000 }).should('be.visible');
    });

    it('marca o idioma ativo via aria-pressed ao alternar pt→en→zh', () => {
        cy.get('[data-testid="lang-opt-pt"]').click();
        cy.get('[data-testid="lang-opt-pt"]').should('have.attr', 'aria-pressed', 'true');

        cy.get('[data-testid="lang-opt-en"]').click();
        cy.get('[data-testid="lang-opt-en"]').should('have.attr', 'aria-pressed', 'true');
        cy.get('[data-testid="lang-opt-pt"]').should('have.attr', 'aria-pressed', 'false');

        cy.get('[data-testid="lang-opt-zh"]').click();
        cy.get('[data-testid="lang-opt-zh"]').should('have.attr', 'aria-pressed', 'true');
        cy.get('[data-testid="lang-opt-en"]').should('have.attr', 'aria-pressed', 'false');
    });

    it('re-renderiza o conteúdo: o CTA do hero muda entre locales', () => {
        // Captura o texto em PT, troca para EN e verifica que MUDOU (sem asserir
        // a string traduzida específica — apenas que difere → houve re-render i18n).
        cy.get('[data-testid="lang-opt-pt"]').click();
        cy.get('[data-testid="landing-connect"]').invoke('text').then((ptText) => {
            cy.get('[data-testid="lang-opt-en"]').click();
            cy.get('[data-testid="landing-connect"]').invoke('text').should((enText) => {
                expect(enText.trim()).to.not.eq(ptText.trim());
            });
        });
    });
});

export {};
