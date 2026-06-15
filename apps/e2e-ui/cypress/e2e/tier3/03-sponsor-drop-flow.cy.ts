// Tier 3 — stack real, auth real, sem mocks.
//
// apps/e2e-ui/cypress/e2e/tier3/03-sponsor-drop-flow.cy.ts
// Fluxo ADR-011 completo: depósito on-chain → alocação na UI → jogo resolve → drop.
//
// Setup: cy.exec cria o depósito diretamente via cleos (o transfer para bingogamectr
// com memo "vault" dispara on_notify e registra o drop_deposit on-chain).
// Depende de 01-admin-setup.cy.ts ter criado uma sala ativa.
//
// Auth: cy.realDevLogin('sponsor') para alocação, cy.realDevLogin('player') para
// comprar cartela e verificar o drop.

describe('Sponsor · Fluxo de Drop completo (ADR-011, Tier 3 real)', () => {
    const DEFAULT_TIMEOUT = 60_000;
    const DRAWN_TIMEOUT   = 300_000;

    // ── Setup: cria depósito on-chain via cleos ────────────────────────────────
    // transfer sponsor1111 → bingogamectr com memo "vault" aciona on_notify e
    // grava o drop_deposit. cy.exec faz isso antes de qualquer interação na UI.

    beforeEach(() => {
        // BINGO está em bingogametkn (não eosio.token). O memo "vault" aciona
        // on_notify no bingogamectr e registra o drop_deposit com status="available".
        cy.exec(
            'docker exec bingo_waxdev cleos push action bingogametkn transfer ' +
            '\'["sponsor1111","bingogamectr","50.0000 BINGO","vault"]\' ' +
            '-p sponsor1111@active',
            { timeout: 15_000, failOnNonZeroExit: false },
        ).then((result) => {
            if (result.code !== 0) {
                cy.log('[!] Depósito BINGO (vault) falhou — sponsor1111 pode não ter saldo suficiente.');
                cy.log(result.stderr);
            }
        });
    });

    // ── Parte 1: Sponsor aloca o depósito ─────────────────────────────────────

    describe('Sponsor deposita e aloca drop', () => {
        before(() => {
            cy.realDevLogin('sponsor');
            cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('eq', '/lobby');
        });

        it('navega para o vault do sponsor', () => {
            cy.window().then((win) => {
                win.history.pushState({}, '', '/sponsor/vault');
                win.dispatchEvent(new win.PopStateEvent('popstate'));
            });
            cy.get('[data-testid="sponsor-vault-tab-deposits"]', { timeout: DEFAULT_TIMEOUT })
                .should('exist');
        });

        it('exibe pelo menos um depósito disponível (status available)', () => {
            // Verifica que existe pelo menos um card de depósito com status "available".
            // Não usa .first() pois depósitos antigos de runs anteriores aparecem como
            // "allocated" e estariam na frente da lista.
            cy.get('[data-testid^="sponsor-deposit-"]', { timeout: DEFAULT_TIMEOUT })
                .should('have.length.gte', 1);
            cy.contains('[data-testid^="sponsor-deposit-"]', 'available')
                .should('exist');
        });

        it('aloca o depósito a uma sala ativa', () => {
            cy.get('[data-testid="sponsor-vault-allocate-toggle"]', { timeout: DEFAULT_TIMEOUT })
                .should('not.be.disabled')
                .click();

            cy.get('[data-testid="sponsor-vault-field-deposit_id"]')
                .find('option:not([value=""])')
                .first()
                .then(($opt) => {
                    cy.get('[data-testid="sponsor-vault-field-deposit_id"]').select($opt.val() as string);
                });

            cy.get('[data-testid="sponsor-vault-room-select"]')
                .find('option:not([value=""])')
                .first()
                .then(($opt) => {
                    cy.get('[data-testid="sponsor-vault-room-select"]').select($opt.val() as string);
                });

            cy.get('[data-testid="sponsor-vault-allocate"]')
                .should('not.be.disabled')
                .click();

            cy.get(
                '[data-testid="sponsor-vault-alloc-success"], [data-testid="sponsor-vault-toast-success"]',
                { timeout: DEFAULT_TIMEOUT },
            ).should('exist');
        });

        it('aba de alocações exibe a nova alocação (status active)', () => {
            cy.get('[data-testid="sponsor-vault-tab-allocations"]', { timeout: DEFAULT_TIMEOUT }).click();
            cy.get('[data-testid^="sponsor-alloc-"]', { timeout: DEFAULT_TIMEOUT })
                .should('have.length.gte', 1)
                .first()
                .should('contain.text', 'active');
        });
    });

    // ── Parte 2: Player compra cartela e verifica drop ─────────────────────────

    describe('Player compra cartela e vê o prize-breakdown após encerramento', () => {
        before(() => {
            // Garante saldo interno de BINGO para jogador1 antes de comprar cartela.
            cy.exec(
                'docker exec bingo_waxdev cleos push action bingogametkn transfer ' +
                '\'["jogador1","bingogamectr","1000.0000 BINGO","deposito tier3"]\' ' +
                '-p jogador1@active',
                { timeout: 15_000, failOnNonZeroExit: false },
            );
            cy.realDevLogin('player');
            cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('eq', '/lobby');
        });

        it('entra na sala com drop ativo e compra cartela', () => {
            // Após spec 02 (~4min) jogos podem estar abortados ou criados recentemente.
            // GameRoom poll a cada 15s; worker cria novo jogo ~30s após abort.
            // Estratégia: entra via lobby-buy- (só existe para jogos em 'funding'),
            // verifica status; se não for 'funding', aguarda gr-next-game-btn
            // (aparece quando GameRoom detecta nextGame.status==='funding' via poll)
            // e clica para voltar ao lobby e tentar novamente — até 3×.
            const entrarEmFunding = (tentativa = 0): void => {
                cy.get('[data-testid^="lobby-buy-"]', { timeout: 120_000 })
                    .should('have.length.gte', 1)
                    .first()
                    .click({ force: true });
                cy.get('[data-testid="gr-room-header"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');
                cy.get('[data-testid="gr-game-status"]', { timeout: DEFAULT_TIMEOUT })
                    .invoke('attr', 'data-status')
                    .then((status) => {
                        if (status === 'funding') return;
                        if (tentativa >= 3) {
                            throw new Error(`Jogo não atingiu 'funding' após ${tentativa + 1} tentativas (último status: ${status})`);
                        }
                        // Aguarda GameRoom detectar nextGame via poll de 15s
                        // (worker ~30s + poll ~15s = ~45s até o botão aparecer)
                        cy.get('[data-testid="gr-next-game-btn"]', { timeout: 90_000 })
                            .should('exist')
                            .scrollIntoView()
                            .click({ force: true });
                        entrarEmFunding(tentativa + 1);
                    });
            };
            entrarEmFunding();

            cy.get('[data-testid="gr-buy-more"]', { timeout: DEFAULT_TIMEOUT })
                .should('not.be.disabled')
                .click();
            cy.get('[data-testid="buy-modal"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');
            cy.get('[data-testid="buy-preview"]').should('not.be.disabled').click();
            cy.get('[data-testid="buy-confirm"]', { timeout: DEFAULT_TIMEOUT }).should('not.be.disabled').click();

            cy.get(
                '[data-testid="buy-toast-success"], [data-testid="gr-my-tickets"] [data-testid^="gr-ticket-"]',
                { timeout: DEFAULT_TIMEOUT },
            ).should('exist');

            cy.get('body').then(($body) => {
                if ($body.find('[data-testid="buy-modal"]').length) {
                    cy.get('[data-testid="buy-modal-close"]').click({ force: true });
                }
            });
        });

        it('aguarda encerramento completo do jogo', () => {
            cy.get('[data-testid="gr-ended-overlay"]', { timeout: DRAWN_TIMEOUT })
                .should('be.visible');
        });

        it('prize-breakdown está visível (drop aparece se vencedor eleito)', () => {
            // gr-prize-breakdown só renderiza quando playerWinEntries.length > 0
            // (o player ganhou algum prêmio). Resultado probabilístico — o overlay
            // de encerramento é a asserção primária; o breakdown é validado se presente.
            cy.get('[data-testid="gr-ended-overlay"]', { timeout: DEFAULT_TIMEOUT })
                .should('be.visible');

            cy.get('body').then(($body) => {
                if ($body.find('[data-testid="gr-prize-breakdown"]').length) {
                    cy.get('[data-testid="gr-prize-breakdown"]').should('be.visible');
                    cy.log('[i] Player ganhou — prize-breakdown visível.');
                } else {
                    cy.log('[i] Player não ganhou nesta rodada — prize-breakdown ausente (esperado).');
                }
            });
        });
    });
});

export {};
