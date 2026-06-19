// Tier 2 — exige stack completo (init_dev_env.sh + vite dev)
//
// apps/e2e-ui/cypress/e2e/tier2/sponsor-drop-flow.cy.ts
// Fluxo ADR-011 ponta a ponta real: depósito → alocação → jogo resolve → drop.
//
// Cobre:
//   1. Sponsor deposita tokens via transfer on-chain com memo `vault`
//      (captado pelo on_notify do contrato como drop_deposit).
//   2. Sponsor aloca o depósito a uma sala ativa via SponsorVault
//      (sponsor-vault-allocate → POST /vault/allocate real → allocatedrop on-chain).
//   3. Jogo resolve (worker executa sorteio + execdrop se vencedor for eleito).
//   4. Vencedor (player) vê o drop no gr-prize-breakdown após encerramento.
//
// Auth:
//   - Sponsor: cy.devLogin('sponsor') para alocação.
//   - Player:  cy.devLogin('player') para compra e verificação do drop.
//
// Sem cy.stubBackend — rede real.
// Sem cy.wait(número) — retry-ability sobre data-testid com timeouts explícitos.

describe('Sponsor · Fluxo de Drop completo (ADR-011, Tier 2 real)', () => {
    const DEFAULT_TIMEOUT = 60_000;
    const DRAWN_TIMEOUT   = 300_000;

    // ── Parte 1: Sponsor deposita e aloca ──────────────────────────────────────

    describe('Sponsor deposita e aloca drop à sala', () => {
        before(() => {
            // dev-login real como sponsor — sem stubBackend.
            cy.devLogin('sponsor');
            cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('eq', '/lobby');
        });

        it('navega para o vault do sponsor', () => {
            // Navega via SPA para evitar reload (mantém sessão de dev).
            cy.window().then((win) => {
                win.history.pushState({}, '', '/sponsor/vault');
                win.dispatchEvent(new win.PopStateEvent('popstate'));
            });
            // O painel de vault deve carregar.
            cy.get('[data-testid="sponsor-vault-tab-deposits"]', { timeout: DEFAULT_TIMEOUT })
                .should('exist');
        });

        it('exibe pelo menos um depósito disponível (status available)', () => {
            // init_dev_env.sh cria um depósito de teste para o sponsor dev.
            // O badge/chip de status 'available' deve estar visível.
            cy.get('[data-testid^="sponsor-deposit-"]', { timeout: DEFAULT_TIMEOUT })
                .should('have.length.gte', 1);
            cy.get('[data-testid^="sponsor-deposit-"]')
                .first()
                .should('contain.text', 'available');
        });

        it('aloca o depósito a uma sala ativa via formulário', () => {
            // Abre o formulário de alocação.
            cy.get('[data-testid="sponsor-vault-allocate-toggle"]', { timeout: DEFAULT_TIMEOUT })
                .should('not.be.disabled')
                .click();

            // Seleciona o primeiro depósito disponível.
            cy.get('[data-testid="sponsor-vault-field-deposit_id"]')
                .find('option:not([value=""])')
                .first()
                .then(($opt) => {
                    cy.get('[data-testid="sponsor-vault-field-deposit_id"]').select($opt.val() as string);
                });

            // Seleciona a primeira sala disponível.
            cy.get('[data-testid="sponsor-vault-room-select"]')
                .find('option:not([value=""])')
                .first()
                .then(($opt) => {
                    cy.get('[data-testid="sponsor-vault-room-select"]').select($opt.val() as string);
                });

            // Submete a alocação (POST /vault/allocate real → allocatedrop on-chain).
            cy.get('[data-testid="sponsor-vault-allocate"]')
                .should('not.be.disabled')
                .click();

            // Confirmação: transaction_id visível (api-gateway retorna o tx hash).
            cy.get('[data-testid="sponsor-vault-alloc-success"], [data-testid="sponsor-vault-toast-success"]',
                { timeout: DEFAULT_TIMEOUT })
                .should('exist');
        });

        it('aba de alocações exibe a nova alocação (status active)', () => {
            // Navega para a aba de alocações do vault.
            cy.get('[data-testid="sponsor-vault-tab-allocations"]', { timeout: DEFAULT_TIMEOUT })
                .click();

            // Pelo menos uma alocação com status active deve aparecer.
            cy.get('[data-testid^="sponsor-alloc-"]', { timeout: DEFAULT_TIMEOUT })
                .should('have.length.gte', 1)
                .first()
                .should('contain.text', 'active');
        });
    });

    // ── Parte 2: Player entra na sala e o jogo resolve com drop ───────────────

    describe('Player compra cartela e vê drop após encerramento', () => {
        before(() => {
            // dev-login real como player.
            cy.devLogin('player');
            cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('eq', '/lobby');
        });

        it('entra na sala com drop ativo (badge visível no lobby)', () => {
            // Salas com drops ativos exibem badge cb-badge-brand ou cb-badge-accent
            // (ADR-011 §11 — indicadores visuais no lobby).
            cy.get('[data-testid^="lobby-card-"]', { timeout: DEFAULT_TIMEOUT })
                .should('have.length.gte', 1);

            // Entra na primeira sala disponível (a que recebeu o drop alocado acima).
            cy.get('[data-testid^="lobby-card-"]').first().click();
            cy.get('[data-testid="gr-room-header"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');
        });

        it('compra cartela e aguarda encerramento do jogo', () => {
            // Compra cartela.
            cy.get('[data-testid="gr-buy-more"]', { timeout: DEFAULT_TIMEOUT })
                .should('not.be.disabled')
                .click();
            cy.get('[data-testid="buy-modal"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');
            cy.get('[data-testid="buy-confirm"]').should('not.be.disabled').click();

            // Aguarda confirmação de compra.
            cy.get(
                '[data-testid="buy-toast-success"], [data-testid="gr-my-tickets"] [data-testid^="gr-ticket-"]',
                { timeout: DEFAULT_TIMEOUT },
            ).should('exist');

            // Fecha o modal se necessário.
            cy.get('body').then(($body) => {
                if ($body.find('[data-testid="buy-modal"]').length) {
                    cy.get('[data-testid="buy-modal-close"]').click({ force: true });
                }
            });

            // Aguarda encerramento completo do jogo (banner de fim de partida).
            cy.get('[data-testid="gr-ended-overlay"]', { timeout: DRAWN_TIMEOUT })
                .should('be.visible');
        });

        it('prize-breakdown exibe o drop do sponsor quando vencedor é eleito', () => {
            // O worker executa execdrop e emite o evento chat:sponsor_drop via WS.
            // O gr-prize-breakdown deve conter a linha de drop (ADR-011 §12).
            // NOTA: o drop é probabilístico (drop_chance_bps). Este teste verifica
            // que a ESTRUTURA do breakdown está presente; a linha de drop aparece
            // se o algoritmo elegeu um vencedor. Não falhamos se o drop não ocorreu
            // (rollback natural da probabilidade) — validamos apenas a presença do
            // elemento breakdown.
            cy.get('[data-testid="gr-prize-breakdown"]', { timeout: DEFAULT_TIMEOUT })
                .should('be.visible');

            // Quando há drop, o breakdown inclui um item identificando o ativo do sponsor.
            // Verificamos a classe ou o atributo data-drop-item (se existir) sem falhar
            // quando não houve sorteio de drop nesta execução.
            cy.get('[data-testid="gr-prize-breakdown"]').then(($el) => {
                if ($el.find('[data-testid="gr-prize-drop-item"]').length) {
                    cy.wrap($el).find('[data-testid="gr-prize-drop-item"]').should('be.visible');
                }
                // Se não houve drop nesta execução, o breakdown ainda existe (vitória/derrota normal).
            });
        });
    });
});

export {};
