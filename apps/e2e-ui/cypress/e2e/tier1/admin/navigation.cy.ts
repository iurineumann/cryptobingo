// apps/e2e-ui/cypress/e2e/tier1/admin/navigation.cy.ts
// Tier 1 — SMOKE: navegação da sidebar do painel admin (ADR-017).
//
// Cobre:
//   - Todas as 11 seções do sidebar renderizam via `admin-nav-{section}`;
//   - Clicar em cada item navega para /admin/{section};
//   - RBAC: perfil `player` acessando /admin/rooms é redirecionado para /lobby.
//
// Seletores SÓ por data-testid (ADR-017 §4 — nunca texto i18n).

describe('Admin · Navegação e RBAC', () => {
    // 11 seções declaradas em AdminLayout.tsx (ADMIN_NAV)
    const SECTIONS = [
        'dashboard',
        'rooms',
        'patterns',
        'gametypes',
        'campaigns',
        'vault',
        'nfts',
        'token',
        'compliance',
        'users',
        'mypanel',
    ] as const;

    describe('SMOKE — sidebar renderiza todas as seções', () => {
        beforeEach(() => {
            // Cenário admin-rooms garante dados para a sidebar (gametypes + patterns)
            cy.devLogin('admin', 'admin-rooms');
            cy.location('pathname', { timeout: 15_000 }).should('include', '/admin');
        });

        it('exibe todos os 11 itens de navegação na sidebar', () => {
            for (const section of SECTIONS) {
                cy.get(`[data-testid="admin-nav-${section}"]`).should('be.visible');
            }
        });

        for (const section of SECTIONS) {
            it(`clicando em admin-nav-${section} navega para /admin/${section}`, () => {
                cy.get(`[data-testid="admin-nav-${section}"]`).click();
                cy.location('pathname', { timeout: 10_000 }).should('eq', `/admin/${section}`);
            });
        }
    });

    describe('RBAC — player é redirecionado ao tentar acessar /admin/*', () => {
        // Navega DENTRO da SPA (sem reload) para preservar a sessão de dev.
        // O dev-login custom não persiste no sessionKit; um cy.visit recarregaria a
        // app sem sessão. pushState + popstate re-renderizam o BrowserRouter (ADR-015).
        function spaNavigate(path: string) {
            cy.window().then((win) => {
                win.history.pushState({}, '', path);
                win.dispatchEvent(new win.PopStateEvent('popstate'));
            });
        }

        it('player em /admin/rooms é redirecionado para /lobby', () => {
            cy.devLogin('player', 'funding');
            cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');

            // AdminGuard em App.tsx: role !== admin → <Navigate to="/lobby" />
            spaNavigate('/admin/rooms');
            cy.location('pathname', { timeout: 10_000 }).should('eq', '/lobby');
        });

        it('player em /admin/dashboard é redirecionado para /lobby', () => {
            cy.devLogin('player', 'funding');
            cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');

            spaNavigate('/admin/dashboard');
            cy.location('pathname', { timeout: 10_000 }).should('eq', '/lobby');
        });
    });
});

export {};
