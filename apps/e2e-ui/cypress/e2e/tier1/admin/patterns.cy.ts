// apps/e2e-ui/cypress/e2e/tier1/admin/patterns.cy.ts
// Tier 1 — GridEditor: criação e visualização de padrões (ADR-017).
//
// Cobre:
//   - Renderizar o GridEditor 5×5 com data-testid="pattern-cell-{r}-{c}";
//   - FREE SPACE = célula [2][2] (bit 12) sempre ativa e não-clicável;
//   - Clicar em células não-FREE atualiza o pattern-bitmask;
//   - Criar padrão válido (POST /admin/patterns) exibe a lista atualizada.
//
// Layout coluna-maior (PatternsAdmin.tsx):
//   bit = col×5 + row → pattern-cell-{row}-{col}
//   FREE SPACE = bit 12 → col=2, row=2 → cell-2-2.

describe('Admin · Padrões (GridEditor)', () => {
    beforeEach(() => {
        cy.intercept('POST', '**/api/v1/admin/patterns', { fixture: 'tx-result.json' }).as('createPattern');
        cy.intercept('DELETE', '**/api/v1/admin/patterns/*', { statusCode: 204 }).as('deletePattern');

        cy.devLogin('admin', 'admin-rooms');
        cy.location('pathname', { timeout: 15_000 }).should('include', '/admin');

        cy.get('[data-testid="admin-nav-patterns"]').click();
        cy.location('pathname', { timeout: 10_000 }).should('eq', '/admin/patterns');
    });

    describe('GridEditor — estrutura', () => {
        it('renderiza todas as 25 células do grid 5×5', () => {
            // 5 linhas × 5 colunas = 25 células
            for (let r = 0; r < 5; r++) {
                for (let c = 0; c < 5; c++) {
                    cy.get(`[data-testid="pattern-cell-${r}-${c}"]`).should('exist');
                }
            }
        });

        it('FREE SPACE [2][2] está desabilitado (não clicável)', () => {
            cy.get('[data-testid="pattern-cell-2-2"]').should('be.disabled');
        });

        it('exibe o bitmask atual em pattern-bitmask', () => {
            // Estado inicial: só FREE SPACE (bit 12 = 4096)
            cy.get('[data-testid="pattern-bitmask"]').should('contain', '4096');
        });
    });

    describe('GridEditor — interação', () => {
        it('clicar na célula [0][0] (bit B1) atualiza o bitmask', () => {
            // bit 0 = col 0 × 5 + row 0 = 0; máscara inicial = 4096 (FREE SPACE).
            // Após clicar em B1: máscara = 4096 | 1 = 4097.
            cy.get('[data-testid="pattern-cell-0-0"]').click();
            cy.get('[data-testid="pattern-bitmask"]').should('contain', '4097');
        });

        it('clicar numa célula ativa a desativa (toggle)', () => {
            // Ativar [0][0]
            cy.get('[data-testid="pattern-cell-0-0"]').click();
            cy.get('[data-testid="pattern-bitmask"]').should('contain', '4097');

            // Desativar [0][0] — bitmask volta a 4096
            cy.get('[data-testid="pattern-cell-0-0"]').click();
            cy.get('[data-testid="pattern-bitmask"]').should('contain', '4096');
        });

        it('clicar em múltiplas células acumula os bits', () => {
            // Ativar B1 (bit 0) e B2 (bit 1): máscara = 4096 | 1 | 2 = 4099
            cy.get('[data-testid="pattern-cell-0-0"]').click();
            cy.get('[data-testid="pattern-cell-1-0"]').click();
            cy.get('[data-testid="pattern-bitmask"]').should('contain', '4099');
        });
    });

    describe('Criar padrão', () => {
        it('pattern-create fica desabilitado sem nome ou sem célula ativa', () => {
            // Estado inicial: sem nome e sem célula ativa (além do FREE SPACE)
            cy.get('[data-testid="pattern-create"]').should('be.disabled');
        });

        it('criar padrão válido chama POST /admin/patterns', () => {
            // Ativar pelo menos uma célula além do FREE SPACE
            cy.get('[data-testid="pattern-cell-0-0"]').click();
            cy.get('[data-testid="pattern-cell-1-0"]').click();
            cy.get('[data-testid="pattern-cell-2-0"]').click();
            cy.get('[data-testid="pattern-cell-3-0"]').click();
            cy.get('[data-testid="pattern-cell-4-0"]').click();

            // Preencher o nome (sem data-testid específico — usa o input de nome do form)
            // PatternsAdmin.tsx: <input className="cb-input" value={name} ... />
            // Não tem data-testid: usamos o input na área do formulário sem testid conflitante
            // (único input de texto no form, acima do botão pattern-create)
            cy.get('[data-testid="pattern-create"]')
                .closest('form')
                .find('input[type="text"], input:not([type])')
                .first()
                .clear()
                .type('ROW_TEST');

            cy.get('[data-testid="pattern-create"]').should('not.be.disabled').click();
            cy.wait('@createPattern');
        });
    });

    describe('Listar padrões existentes', () => {
        it('renderiza os padrões da fixture patterns.json', () => {
            // patterns.json tem: ROW_1, ROW_2, DIAG_TL_BR, MASTER
            cy.contains('ROW_1').should('be.visible');
            cy.contains('MASTER').should('be.visible');
        });
    });
});

export {};
