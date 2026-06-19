// Tier 3 — stack real, auth real, sem mocks.
//
// apps/e2e-ui/cypress/e2e/tier3/02-player-full-game.cy.ts
// Jornada completa do jogador contra a chain real + oracle daemon.
// Depende de 01-admin-setup.cy.ts ter criado e ativado uma sala (worker
// cria o jogo na sala ativa automaticamente).
//
// beforeEach faz realDevLogin — cada teste começa no /lobby com JWT fresco.
// Cada teste é responsável por navegar até a sala e aguardar o estado correto.
//
// Tolerâncias: slow-reveal real leva ~285s (75 bolas × ~3.8s cada).
// Auth: cy.realDevLogin('player') — JWT real sem intercept.

describe('Player · Jornada completa de jogo (Tier 3 real)', () => {
    const GAME_READY_TIMEOUT = 120_000; // worker pode demorar até 2 min para criar o jogo
    const DEFAULT_TIMEOUT    =  60_000;
    const LOCK_TIMEOUT       =  90_000;
    const DRAWN_TIMEOUT      = 300_000;

    // URL do game room capturada no test 2 (buy) e reutilizada nos testes seguintes.
    // Evita que testes 3-6 naveguem para um NOVO jogo criado pelo worker após o jogo
    // original encerrar (o lobby sempre exibe o jogo mais recente da sala).
    let savedGameUrl = '';

    beforeEach(() => {
        // buytickets exige saldo interno no contrato (balances table).
        // Depositamos via on_notify antes de cada teste para garantir que jogador1
        // tenha BINGO suficiente, independente de testes anteriores.
        cy.exec(
            'docker exec bingo_waxdev cleos push action bingogametkn transfer ' +
            '\'["jogador1","bingogamectr","1000.0000 BINGO","deposito tier3"]\' ' +
            '-p jogador1@active',
            { timeout: 15_000, failOnNonZeroExit: false },
        ).then((result) => {
            if (result.code !== 0) cy.log('[!] Depósito BINGO para jogador1 falhou — buytickets pode falhar.');
        });
        cy.realDevLogin('player');
        cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('eq', '/lobby');
    });

    // ── Helper: entra no game room ─────────────────────────────────────────────
    // Se savedGameUrl está definido, usa pushState (SPA navigation) para navegar
    // direto ao jogo específico. cy.visit() num contexto pós-beforeEach causa
    // redirect para '/' no Electron porque recria o contexto JS e o AuthGuard
    // não encontra o JWT no sessionStorage recém-reiniciado.
    // Fallback: usa lobby-buy (funding) ou lobby-card (outro estado).
    const entrarNaSala = (timeout = DEFAULT_TIMEOUT) => {
        if (savedGameUrl) {
            const path = savedGameUrl.replace(/^https?:\/\/[^/]+/, '');
            cy.window().then((win) => {
                win.history.pushState({}, '', path);
                win.dispatchEvent(new win.PopStateEvent('popstate'));
            });
            cy.get('[data-testid="gr-room-header"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');
            return;
        }
        cy.get('[data-testid^="lobby-card-"]', { timeout }).should('have.length.gte', 1);
        cy.get('body').then(($body) => {
            const buyBtn = $body.find('[data-testid^="lobby-buy-"]');
            if (buyBtn.length) {
                cy.wrap(buyBtn.first()).click();
            } else {
                cy.get('[data-testid^="lobby-card-"]').first().click();
            }
        });
        cy.get('[data-testid="gr-room-header"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');
    };

    // ── 1. Gate de funding ─────────────────────────────────────────────────────
    // Aguarda o worker criar o jogo na sala ativada pelo 01-admin-setup.
    // Os testes seguintes dependem deste ter passado (jogo em funding = navegável).

    it('lobby exibe jogo em funding (worker criou o jogo na sala ativada)', () => {
        cy.get('[data-testid^="lobby-buy-"]', { timeout: GAME_READY_TIMEOUT })
            .should('have.length.gte', 1);
    });

    // ── 2. Compra de cartela ───────────────────────────────────────────────────

    it('entra na sala (funding) e compra cartela on-chain', () => {
        // Aguarda funding explicitamente antes de navegar
        cy.get('[data-testid^="lobby-buy-"]', { timeout: GAME_READY_TIMEOUT }).first().click();
        cy.get('[data-testid="gr-room-header"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');

        // Captura a URL do game room para que os testes seguintes naveguem para
        // este jogo específico (e não para um novo jogo criado pelo worker).
        cy.url().then((url) => { savedGameUrl = url; });

        // Confirma estado funding antes de abrir modal de compra
        cy.get('[data-testid="gr-game-status"]', { timeout: DEFAULT_TIMEOUT })
            .should('have.attr', 'data-status', 'funding');

        cy.get('[data-testid="gr-buy-more"]', { timeout: DEFAULT_TIMEOUT })
            .should('not.be.disabled').click();
        cy.get('[data-testid="buy-modal"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');

        // O modal tem 2 steps: form → preview. buy-preview gera as cartelas e avança.
        // buy-confirm só aparece no step preview (BuyTicketModal.tsx:633).
        cy.get('[data-testid="buy-preview"]').should('not.be.disabled').click();
        cy.get('[data-testid="buy-confirm"]', { timeout: DEFAULT_TIMEOUT })
            .should('not.be.disabled').click();

        // Sucesso: cartela aparece na seção de tickets (ou toast, se implementado)
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

    // ── 3. Transição para locked / drawing ────────────────────────────────────

    it('jogo avança para locked ou drawing (worker processou o período de funding)', () => {
        entrarNaSala(GAME_READY_TIMEOUT);

        // Aguarda qualquer estado pós-funding (locked → drawing → drawn → archived)
        cy.get('[data-testid="gr-game-status"]', { timeout: LOCK_TIMEOUT })
            .should(($el) => {
                expect($el.attr('data-status')).to.match(/locked|drawing|drawn|archived/);
            });
    });

    // ── 4. Bolas via WebSocket ─────────────────────────────────────────────────

    it('bolas sorteadas chegam via WebSocket real (oracle → broadcaster)', () => {
        entrarNaSala(GAME_READY_TIMEOUT);

        // Aguarda drawing antes de checar bolas (evita falso negativo em locked)
        cy.get('[data-testid="gr-game-status"]', { timeout: LOCK_TIMEOUT })
            .should(($el) => {
                expect($el.attr('data-status')).to.match(/drawing|drawn|archived/);
            });

        // Cada bola leva ~3.8s no reveal; 10 bolas = ~38s mínimo de evidência
        cy.get('[data-testid="gr-ball-history"] .gr-mini-ball', { timeout: DRAWN_TIMEOUT })
            .should('have.length.gte', 10);
    });

    // ── 5. Encerramento ────────────────────────────────────────────────────────

    it('banner de encerramento aparece após o jogo completo', () => {
        entrarNaSala(GAME_READY_TIMEOUT);
        cy.get('[data-testid="gr-ended-overlay"]', { timeout: DRAWN_TIMEOUT })
            .should('be.visible');
    });

    // ── 6. Link de histórico ───────────────────────────────────────────────────

    it('histórico de partida acessível após encerramento', () => {
        entrarNaSala(GAME_READY_TIMEOUT);
        cy.get('[data-testid="gr-ended-overlay"]', { timeout: DRAWN_TIMEOUT })
            .should('be.visible');
        cy.get(
            '[data-testid="gr-history-link"], [data-testid="gr-ended-overlay"] [data-testid="gr-view-history"]',
            { timeout: DEFAULT_TIMEOUT },
        ).should('exist');
    });
});

export {};
