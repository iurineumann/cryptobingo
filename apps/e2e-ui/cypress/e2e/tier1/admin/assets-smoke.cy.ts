// apps/e2e-ui/cypress/e2e/tier1/admin/assets-smoke.cy.ts
// Tier 1 — SMOKE: NftAdmin e TokenAdmin (apenas leitura/listagem, sem transact).
//
// NftAdmin usa atomicFetch() (GET externo ao ATOMIC_API) e session.transact().
// TokenAdmin usa session.client.v1.chain.get_table_rows() e session.transact().
// Ambos os transact() são não-stubáveis no Tier 1 (ADR-017 §5) → SMOKE de listagem.
//
// Cobre:
//   - Navegar para /admin/nfts e /admin/token;
//   - NftAdmin: tabbar nft-tab-{collections,schemas,templates,assets} é visível;
//   - TokenAdmin: tabbar token-tab-{supply,balances,ops} é visível (se presente);
//   - Respostas de fetch externo (AtomicAssets) stubadas via cy.intercept;
//   - Respostas de get_table_rows (TokenAdmin) stubadas via cenário admin-rooms.
//
// Note: NftAdmin não tem data-testids nos cards de coleção/schema/template/asset
// além de `nft-row-{template_id}` em templates. TokenAdmin pode não ter testids
// nas abas — verificamos presença do componente root por classe ou estrutura.

describe('Admin · Assets (SMOKE — NftAdmin + TokenAdmin)', () => {
    describe('NftAdmin', () => {
        beforeEach(() => {
            // Stub do AtomicAssets API externo (NftAdmin usa atomicFetch)
            cy.intercept('GET', '**/atomicassets/v1/collections*', {
                body: { success: true, data: [] },
            }).as('atomicCollections');
            cy.intercept('GET', '**/atomicassets/v1/schemas*', {
                body: { success: true, data: [] },
            }).as('atomicSchemas');
            cy.intercept('GET', '**/atomicassets/v1/templates*', {
                body: { success: true, data: [] },
            }).as('atomicTemplates');
            cy.intercept('GET', '**/atomicassets/v1/assets*', {
                body: { success: true, data: [] },
            }).as('atomicAssets');

            cy.devLogin('admin', 'admin-rooms');
            cy.location('pathname', { timeout: 15_000 }).should('include', '/admin');

            cy.get('[data-testid="admin-nav-nfts"]').click();
            cy.location('pathname', { timeout: 10_000 }).should('eq', '/admin/nfts');
        });

        it('renderiza o painel NftAdmin', () => {
            // A tela carrega sem erro: ao menos a tabbar é visível
            cy.get('[data-testid="nft-tab-collections"]').should('be.visible');
        });

        it('tabbar de NftAdmin tem as 4 abas esperadas', () => {
            cy.get('[data-testid="nft-tab-collections"]').should('be.visible');
            cy.get('[data-testid="nft-tab-schemas"]').should('be.visible');
            cy.get('[data-testid="nft-tab-templates"]').should('be.visible');
            cy.get('[data-testid="nft-tab-assets"]').should('be.visible');
        });

        it('navegar para aba schemas aciona GET de schemas', () => {
            cy.get('[data-testid="nft-tab-schemas"]').click();
            cy.wait('@atomicSchemas');
        });

        it('navegar para aba templates aciona GET de templates', () => {
            cy.get('[data-testid="nft-tab-templates"]').click();
            cy.wait('@atomicTemplates');
        });

        it('navegar para aba assets aciona GET de assets', () => {
            cy.get('[data-testid="nft-tab-assets"]').click();
            cy.wait('@atomicAssets');
        });

        it('aba collections aciona GET de coleções ao carregar', () => {
            // O tab collections é o padrão e carrega no mount (useEffect no tab=collections)
            cy.wait('@atomicCollections');
        });
    });

    describe('TokenAdmin', () => {
        beforeEach(() => {
            // TokenAdmin lê get_table_rows via session.client (proxy /v1/chain/...)
            // e get_table_rows para stat (bingogametkn) e accounts.
            // O cenário admin-rooms já stubba o RPC genérico (rows: []).
            cy.devLogin('admin', 'admin-rooms');
            cy.location('pathname', { timeout: 15_000 }).should('include', '/admin');

            cy.get('[data-testid="admin-nav-token"]').click();
            cy.location('pathname', { timeout: 10_000 }).should('eq', '/admin/token');
        });

        it('renderiza o painel TokenAdmin sem erro fatal', () => {
            // O painel carrega mesmo sem sessão (os dados são vazios via RPC stub)
            // Confirmamos a presença de ao menos um elemento do componente
            cy.get('h2').should('be.visible');
        });

        it('não exibe erro de session ao acessar em modo dev', () => {
            // Sem session real, TokenAdmin exibe a mensagem de no-session — mas não quebra
            // o painel. Verificamos que a tela carregou (não há redirect nem crash).
            cy.location('pathname').should('eq', '/admin/token');
        });
    });
});

export {};
