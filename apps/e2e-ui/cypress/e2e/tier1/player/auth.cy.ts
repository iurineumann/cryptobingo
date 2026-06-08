// apps/e2e-ui/cypress/e2e/tier1/player/auth.cy.ts
// Tier 1 — jornada de autenticação do JOGADOR (ADR-006, ADR-017).
//
// Cobre:
//   - dev-login real (assina SHA256(nonce) localmente) → chega ao /lobby;
//   - RBAC: player NÃO acessa /admin/* nem /sponsor/* (guards redirecionam → /lobby).
//
// Seletores SÓ por data-testid; rede determinística via cy.devLogin (intercepta
// challenge/verify/profile). NÃO fabricamos JWT — o app grava em sessionStorage.

describe('Player · Autenticação e RBAC', () => {
    it('faz dev-login como player e chega ao lobby', () => {
        // Cenário funding garante que o lobby pós-login tenha dados de sala.
        cy.devLogin('player', 'funding');

        // O dev-login navega para /lobby após verify+profile.
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
        // Card da sala em funding renderiza → confirma que entramos na área do player.
        cy.get('[data-testid="lobby-card-1"]').should('exist');
    });

    it('persiste o JWT em sessionStorage (auth real, não fabricada)', () => {
        cy.devLogin('player', 'funding');
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
        // services/api.ts grava o token sob a chave cb_jwt — prova de fluxo real.
        cy.window().its('sessionStorage').invoke('getItem', 'cb_jwt').should('be.a', 'string').and('not.be.empty');
    });

    // Navega DENTRO da SPA (sem reload) para preservar a sessão de dev — o
    // dev-login custom não é persistido no sessionKit, então um cy.visit recarregaria
    // a app sem sessão (AuthGuard mandaria para "/"). pushState + popstate fazem o
    // BrowserRouter re-renderizar na nova rota mantendo o estado React (session).
    function spaNavigate(path: string) {
        cy.window().then((win) => {
            win.history.pushState({}, '', path);
            win.dispatchEvent(new win.PopStateEvent('popstate'));
        });
    }

    it('RBAC: player em /admin/dashboard é redirecionado para /lobby', () => {
        cy.devLogin('player', 'funding');
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');

        // AdminGuard (App.tsx): role player (não-admin) → Navigate to /lobby.
        spaNavigate('/admin/dashboard');
        cy.location('pathname', { timeout: 10_000 }).should('eq', '/lobby');
    });

    it('RBAC: player em /sponsor/rooms é redirecionado para /lobby', () => {
        cy.devLogin('player', 'funding');
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');

        // SponsorGuard (App.tsx): role player (não-sponsor) → Navigate to /lobby.
        spaNavigate('/sponsor/rooms');
        cy.location('pathname', { timeout: 10_000 }).should('eq', '/lobby');
    });
});

export {};
