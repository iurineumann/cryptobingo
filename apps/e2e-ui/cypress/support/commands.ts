// apps/e2e-ui/cypress/support/commands.ts
// Comandos customizados reutilizáveis da suíte E2E de UI (ADR-017).
//
// Princípios (ver skill e2e-ui-cypress + ADR-017):
//   - Auth via o DEV-LOGIN REAL: nunca fabricamos JWT à mão. Interceptamos só a
//     borda de rede (challenge/verify/profile) e deixamos useAuth.ts assinar o
//     nonce localmente e services/api.ts gravar o token em sessionStorage.cb_jwt.
//   - Rede determinística no Tier 1: toda chamada REST/RPC passa por cy.intercept,
//     organizada num mapa cenário→intercepts (extensível).
//   - Slow-reveal sem timers reais: mock-socket substitui o endpoint socket.io
//     ANTES do visit; emitimos eventos manualmente (cy.emitBall/cy.emitWinner).
//   - Seletores SEMPRE por data-testid (i18n pt/en/zh quebra seleção por texto).
//
// Os testids `dev-login-${role}` são instrumentados no frontend na Fase 1 — aqui
// já os assumimos como contrato estável.

import { Server as MockServer } from 'mock-socket';

// ==========================================
// TIPOS
// ==========================================

/** Papéis dirigíveis pelo dev-login. */
export type DevRole = 'player' | 'player2' | 'admin' | 'contract-admin' | 'sponsor';

/** Cenários de backend stubável no Tier 1 (extensível). */
export type StubScenario =
    | 'funding'             // player: sala vendável (game em funding)
    | 'archived-combo-win'  // player: jogo encerrado com vitória de combinação (ADR-010/016)
    | 'admin-rooms'         // admin: CRUD de salas/gametypes/patterns
    | 'admin-vault'         // admin: vault/drops (deposits/allocations)
    | 'sponsor-rooms';      // sponsor: salas próprias + alocação de drops

/**
 * Payload do evento winner_found, espelhando o handler de useSlowReveal.ts:
 *   socket.on('winner_found', (msg: { game_id; payload: { winning_ball; winners } }))
 * onde `winners` segue WinnerPayload (apps/frontend/src/types/events.ts).
 */
export interface EmitWinnerPayload {
    winning_ball: number | null;
    winners: Array<{
        account:     string;
        ticket_id:   string;
        win_pattern: string;
        payouts:     string[];
    }>;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Cypress {
        interface Chainable {
            /**
             * Dirige o dev-login real para o `role` dado: registra os intercepts de
             * auth (challenge/verify/profile coerente com o papel) e de RPC, visita
             * a raiz e clica em [data-testid="dev-login-${role}"]. O JWT é gravado
             * pelo próprio app — NÃO fabricamos token.
             */
            devLogin(role: DevRole): Chainable<void>;

            /**
             * Carrega o conjunto de fixtures e registra os intercepts REST/RPC do
             * cenário. Deve ser chamado ANTES do cy.visit que dispara as chamadas.
             */
            stubBackend(scenario: StubScenario): Chainable<void>;

            /**
             * Injeta um mock-socket (Server) substituindo o endpoint socket.io ANTES
             * do visit. Guarda o server em `cy.get('@mockSocket')` para emissão.
             */
            mockSocket(): Chainable<MockServer>;

            /** Emite um evento ball_drawn no socket mockado (slow-reveal manual). */
            emitBall(n: number): Chainable<void>;

            /** Emite um evento winner_found no socket mockado. */
            emitWinner(payload: EmitWinnerPayload): Chainable<void>;
        }
    }
}

// ==========================================
// MAPA DE PAPÉIS → role on-chain do profile
// ==========================================
// O guard do App.tsx deriva isAdmin de role ∈ {admin, contract_admin}; isSponsor
// de role === 'sponsor'. As fixtures de profile já trazem o role coerente; este
// mapa escolhe QUAL fixture carregar para cada papel de dev-login.

const PROFILE_FIXTURE_BY_ROLE: Record<DevRole, string> = {
    'player':         'profile.player.json',
    'player2':        'profile.player.json',  // mesmo perfil base; actor difere via dev-login
    'admin':          'profile.admin.json',
    'contract-admin': 'profile.admin.json',   // ambos resolvem isAdmin no guard
    'sponsor':        'profile.sponsor.json',
};

// ==========================================
// cy.devLogin(role)
// ==========================================

Cypress.Commands.add('devLogin', (role: DevRole) => {
    const profileFixture = PROFILE_FIXTURE_BY_ROLE[role];

    // ── Auth: challenge → verify → profile ────────────────────────────────────
    // useAuth.ts (modo DEV) assina SHA256(nonce) localmente com a chave de dev e
    // chama /auth/verify; o nonce DEVE bater entre challenge e verify, então o
    // verify responde com o token fixo da fixture independentemente do corpo.
    cy.intercept('POST', '**/api/v1/auth/challenge', { fixture: 'auth/challenge.json' }).as('authChallenge');
    cy.intercept('POST', '**/api/v1/auth/verify',    { fixture: 'auth/verify.json' }).as('authVerify');
    cy.intercept('GET',  '**/api/v1/profile',        { fixture: profileFixture }).as('profile');

    // ── RPC mínimo: a UI pós-login (lobby) lê tabelas on-chain via proxy /v1 ──
    // Roteamos por nome de tabela para a fixture certa; default = linhas vazias.
    stubRpcTableRows();

    cy.visit('/');
    // O dev-login fica num dropdown colapsado no rodapé: abrir o toggle e então
    // clicar no perfil. Os botões `dev-login-${role}` só existem no DOM com o
    // dropdown aberto (devOpen) — LandingPage.tsx.
    cy.get('[data-testid="dev-login-toggle"]').click();
    cy.get(`[data-testid="dev-login-${role}"]`).click();
});

// ==========================================
// cy.stubBackend(scenario)
// ==========================================

/**
 * Registra os intercepts REST de um cenário. Cada entrada é uma função idempotente
 * que pode ser estendida na Fase 3 com mais endpoints sem tocar nos demais cenários.
 */
const SCENARIO_INTERCEPTS: Record<StubScenario, () => void> = {
    'funding': () => {
        cy.intercept('GET', '**/api/v1/rooms',     { fixture: 'rooms.funding.json' }).as('rooms');
        cy.intercept('GET', '**/api/v1/rooms/*',   { fixture: 'rooms.funding.json' }).as('room');
        stubRpcTableRows({ games: 'game.funding.json', tickets: 'tickets.json' });
    },
    'archived-combo-win': () => {
        cy.intercept('GET', '**/api/v1/rooms',   { fixture: 'rooms.funding.json' }).as('rooms');
        cy.intercept('GET', '**/api/v1/rooms/*', { fixture: 'rooms.funding.json' }).as('room');
        // Metadados de combinação (ADR-016) + estatísticas públicas do jogo encerrado.
        cy.intercept('GET', '**/api/v1/gametypes/*/metadata', { fixture: 'gametype-meta.json' }).as('gametypeMeta');
        cy.intercept('GET', '**/api/v1/player/winnings/*',    { fixture: 'tx-result.json' }).as('winnings');
        stubRpcTableRows({ games: 'game.archived-combo-win.json', tickets: 'tickets.json' });
    },
    'admin-rooms': () => {
        cy.intercept('GET',  '**/api/v1/admin/gametypes', { fixture: 'gametypes.json' }).as('gametypes');
        cy.intercept('GET',  '**/api/v1/admin/patterns',  { fixture: 'patterns.json' }).as('patterns');
        cy.intercept('GET',  '**/api/v1/rooms',           { fixture: 'rooms.funding.json' }).as('rooms');
        cy.intercept('POST', '**/api/v1/rooms',           { fixture: 'tx-result.json' }).as('createRoom');
        cy.intercept('POST', '**/api/v1/admin/gametypes', { fixture: 'tx-result.json' }).as('createGametype');
        stubRpcTableRows();
    },
    'admin-vault': () => {
        cy.intercept('GET',  '**/api/v1/vault/deposits',    { fixture: 'deposits.json' }).as('deposits');
        cy.intercept('GET',  '**/api/v1/vault/allocations*', { fixture: 'allocations.json' }).as('allocations');
        cy.intercept('POST', '**/api/v1/vault/allocate',    { fixture: 'tx-result.json' }).as('allocate');
        stubRpcTableRows();
    },
    'sponsor-rooms': () => {
        cy.intercept('GET',  '**/api/v1/sponsor/rooms',     { fixture: 'sponsor-rooms.json' }).as('sponsorRooms');
        cy.intercept('GET',  '**/api/v1/vault/deposits',    { fixture: 'deposits.json' }).as('deposits');
        cy.intercept('GET',  '**/api/v1/vault/allocations*', { fixture: 'allocations.json' }).as('allocations');
        cy.intercept('POST', '**/api/v1/vault/allocate',    { fixture: 'tx-result.json' }).as('allocate');
        stubRpcTableRows();
    },
};

Cypress.Commands.add('stubBackend', (scenario: StubScenario) => {
    const register = SCENARIO_INTERCEPTS[scenario];
    if (!register) throw new Error(`[stubBackend] cenário desconhecido: ${scenario}`);
    register();
});

// ==========================================
// RPC get_table_rows (proxy /v1/chain/...)
// ==========================================

/**
 * Intercepta `POST **\/v1/chain/get_table_rows` e roteia por `req.body.table`
 * para a fixture certa. Tabelas sem mapeamento respondem `{ rows: [], more: false }`.
 *
 * O frontend (utils/rpc.ts) pode chamar via session.client OU via fetch direto no
 * proxy; ambos batem na mesma URL `/v1/chain/get_table_rows`, então um único
 * intercept cobre os dois caminhos.
 */
function stubRpcTableRows(tableMap: Record<string, string> = {}): void {
    cy.intercept('POST', '**/v1/chain/get_table_rows', (req) => {
        const table = (req.body as { table?: string })?.table ?? '';
        const fixture = tableMap[table];
        if (fixture) {
            req.reply({ fixture });
        } else {
            // Resposta vazia coerente com o formato de get_table_rows.
            req.reply({ statusCode: 200, body: { rows: [], more: false, next_key: '' } });
        }
    }).as('getTableRows');
}

// ==========================================
// SOCKET MOCK (slow-reveal — mock-socket)
// ==========================================
// useSlowReveal usa io(WS_URL) com WS_URL='' em dev → resolve para a origin atual
// (http://127.0.0.1:5173) e o proxy Vite encaminha /socket.io. No Tier 1 não há
// proxy/broadcaster: substituímos o endpoint por um mock-socket Server e emitimos
// os eventos manualmente. Os payloads espelham EXATAMENTE os handlers de
// useSlowReveal.ts (envelope { event, game_id, payload }).

/** game_id default usado nos eventos emitidos; sobrescrevível via Cypress.env. */
function activeGameId(): number {
    return Number(Cypress.env('gameId') ?? 0);
}

Cypress.Commands.add('mockSocket', () => {
    // socket.io sobre o endpoint de origin; o transport 'websocket' usa o caminho
    // /socket.io/. mock-socket intercepta a URL de WebSocket no window do app.
    // Injetamos no window ANTES do visit via cy.on('window:before:load').
    const wsUrl = `ws://127.0.0.1:5173/socket.io/?EIO=4&transport=websocket`;

    return cy.window({ log: false }).then(() => {
        const server = new MockServer(wsUrl);
        // Guarda o server como alias para emissões posteriores.
        cy.wrap(server, { log: false }).as('mockSocket');
        return server;
    });
});

Cypress.Commands.add('emitBall', (n: number) => {
    cy.get<MockServer>('@mockSocket').then((server) => {
        const order = (Cypress.env('__ballOrder') ?? 0) + 1;
        Cypress.env('__ballOrder', order);
        // Espelha o handler ball_drawn: { event, game_id, payload: DrawnBall }.
        server.emit('ball_drawn', {
            event:   'ball_drawn',
            game_id: activeGameId(),
            payload: {
                order,
                number:    n,
                timestamp: new Date().toISOString(),
            },
        });
    });
});

Cypress.Commands.add('emitWinner', (payload: EmitWinnerPayload) => {
    cy.get<MockServer>('@mockSocket').then((server) => {
        // Espelha o handler winner_found: { event, game_id, payload: { winning_ball, winners } }.
        server.emit('winner_found', {
            event:   'winner_found',
            game_id: activeGameId(),
            payload,
        });
    });
});

// Necessário para que o arquivo seja tratado como módulo (escopo das declarações).
export {};
