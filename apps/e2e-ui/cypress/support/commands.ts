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

import { Server as MockServer, WebSocket as MockWebSocket } from 'mock-socket';

// Fixtures que precisam de acesso SÍNCRONO dentro de um resolver de cy.intercept
// (resolver não pode ser async). Importadas estaticamente — o bundler do Cypress
// resolve o JSON em tempo de build. As demais fixtures usam o roteamento por
// { fixture } padrão (carregamento assíncrono do Cypress).
import rpcPatternsFixture from '../fixtures/rpc.patterns.json';
import roomsFundingFixture from '../fixtures/rooms.funding.json';

const SYNC_FIXTURES: Record<string, unknown> = {
    'rpc.patterns.json':  rpcPatternsFixture,
    'rooms.funding.json': roomsFundingFixture,
};

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
            devLogin(role: DevRole, scenario?: StubScenario): Chainable<void>;

            /**
             * Tier 3 — login real sem nenhum intercept: clica o botão de dev-login
             * no footer e aguarda a auth completa contra o api-gateway real. Exige
             * stack completa rodando (api-gateway + frontend dev). O JWT é emitido
             * pelo api-gateway com o JWT_SECRET real; chamadas subsequentes usam
             * esse token sem mock.
             */
            realDevLogin(role: DevRole): Chainable<void>;

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

            /**
             * Emite um evento socket.io arbitrário (envelope cru) no socket mockado.
             * Útil para eventos sem comando dedicado (game_ended, golden_ball, etc.).
             */
            emitSocketEvent(event: string, payload: unknown): Chainable<void>;
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

Cypress.Commands.add('devLogin', (role: DevRole, scenario?: StubScenario) => {
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
    // Se um `scenario` for informado, registramos seus intercepts REST/RPC DEPOIS
    // (e ANTES do visit) — o último cy.intercept de cada rota vence, garantindo que
    // o cenário sobrescreva o stub RPC vazio default sem condição de corrida.
    stubRpcTableRows();
    if (scenario) {
        const register = SCENARIO_INTERCEPTS[scenario];
        if (!register) throw new Error(`[devLogin] cenário desconhecido: ${scenario}`);
        register();
    }

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
        cy.intercept('GET', '**/api/v1/rooms',   { fixture: 'rooms.funding.json' }).as('rooms');
        cy.intercept('GET', '**/api/v1/rooms/1', { body: roomFromFixtureById('1') }).as('room');
        // RPC: balances (chip da carteira), games (sala em funding), gametypes (prêmio máx).
        // tickets devolve vazio por jogador (sem cartelas) — a query usa índice secundário.
        stubRpcTableRows({
            balances:  'balances.json',
            games:     'game.funding.json',
            gametypes: 'rpc.gametypes.json',
        });
    },
    'archived-combo-win': () => {
        // fetchRoom() resolve a sala da partida encerrada (nome/metadata no crumb).
        cy.intercept('GET', '**/api/v1/rooms',   { fixture: 'rooms.funding.json' }).as('rooms');
        cy.intercept('GET', '**/api/v1/rooms/1', { body: roomFromFixtureById('1') }).as('room');
        // Metadados de combinação (ADR-016): combinations + rules+tipos vêm do endpoint
        // PÚBLICO /gametypes/:id/metadata (fetchPublicGametypeMetadata) — consumido pelo
        // GameRoom para montar gameCombinations/extendedRules.
        cy.intercept('GET', '**/api/v1/gametypes/*/metadata', { fixture: 'gametype-meta.json' }).as('gametypeMeta');
        cy.intercept('GET', '**/api/v1/player/winnings/*',    { fixture: 'tx-result.json' }).as('winnings');
        // RPC: games (archived com drawn_balls), tickets (cartela vencedora de combo) e
        // as tabelas gametypes/patterns que fetchGamePatterns lê por pattern_id (keyed).
        stubRpcTableRows({
            games:     'game.archived-combo-win.json',
            tickets:   'tickets.combo-win.json',
            gametypes: 'rpc.gametypes.json',
            patterns:  keyedByLowerBound('rpc.patterns.json', 'pattern_id'),
        });
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
// cy.realDevLogin(role) — Tier 3
// ==========================================
// Sem nenhum cy.intercept: visita a raiz, abre o dropdown de dev-login do footer
// (só existe com import.meta.env.DEV=true) e clica no botão do papel. O frontend
// executa o fluxo real: challenge → assinatura local com WalletPluginPrivateKey
// (VITE_DEV_KEY_*) → verify → JWT real emitido pelo api-gateway.
// Aguarda a navegação pós-auth como sinal de conclusão.

Cypress.Commands.add('realDevLogin', (role: DevRole) => {
    cy.visit('/');
    cy.get('[data-testid="dev-login-toggle"]', { timeout: 10_000 }).click();
    cy.get(`[data-testid="dev-login-${role}"]`, { timeout: 10_000 }).click();
    // Sinal de auth concluída: o app sai de '/' após gravar o JWT e carregar o profile.
    cy.location('pathname', { timeout: 30_000 }).should('not.eq', '/');
});

// ==========================================
// RPC get_table_rows (proxy /v1/chain/...)
// ==========================================

/**
 * Resolver de uma resposta de get_table_rows. Recebe o corpo da requisição
 * (com table/lower_bound/upper_bound) e devolve o nome de uma fixture OU um body
 * inline `{ rows, more, next_key }`. Permite respostas KEYED por chave primária —
 * necessário quando o frontend varre uma tabela 1-linha-por-vez (ex.: patterns).
 */
type RpcResolver = (body: Record<string, unknown>) => { fixture: string } | { body: unknown };

/**
 * Normaliza o corpo de uma requisição de get_table_rows. O Wharfkit serializa o
 * payload como STRING JSON; o Cypress não o parseia automaticamente. Aceitamos
 * tanto string quanto objeto (defensivo) e devolvemos sempre um objeto.
 */
function parseRpcBody(raw: unknown): Record<string, unknown> {
    if (typeof raw === 'string') {
        try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
    }
    return (raw ?? {}) as Record<string, unknown>;
}

/** Aceita fixture estática (string) ou resolver dinâmico (keyed). */
type RpcTableEntry = string | RpcResolver;

/**
 * Devolve um resolver que carrega `fixtureName` (shape `{ rows: [...] }`) e filtra
 * a linha cujo `pkField` casa com o `lower_bound` da query (lookup por PK). Espelha
 * o padrão de `fetchGamePatterns`/`GameRoom`, que pedem 1 pattern_id por vez com
 * `lower_bound == upper_bound == id` e leem `rows[0]`. Sem `lower_bound`, devolve
 * todas as linhas (varredura).
 */
function keyedByLowerBound(fixtureName: string, pkField: string): RpcResolver {
    return (body) => {
        const lb = body.lower_bound != null ? String(body.lower_bound) : undefined;
        // O carregamento é assíncrono; resolvemos via body inline lendo a fixture
        // pelo cache do Cypress no momento da resposta (cy.fixture é assíncrono, então
        // pré-carregamos via require do JSON empacotado pelo bundler do support).
        const all = (loadFixtureSync(fixtureName) as { rows?: Array<Record<string, unknown>> }).rows ?? [];
        const rows = lb == null ? all : all.filter(r => String(r[pkField]) === lb);
        return { body: { rows, more: false, next_key: '' } };
    };
}

// Acesso síncrono às fixtures importadas estaticamente (ver topo do arquivo).
function loadFixtureSync(name: string): unknown {
    const data = SYNC_FIXTURES[name];
    if (!data) throw new Error(`[loadFixtureSync] fixture não importada estaticamente: ${name}`);
    return data;
}

/** Lê a fixture de rooms e devolve a sala cujo room_id casa (shape de fetchRoom). */
function roomFromFixtureById(roomId: string): unknown {
    const data = loadFixtureSync('rooms.funding.json') as { rooms: Array<Record<string, unknown>> };
    return data.rooms.find(r => String(r.room_id) === roomId) ?? data.rooms[0];
}

/**
 * Intercepta `POST **\/v1/chain/get_table_rows` e roteia por `req.body.table`
 * para a fixture/resolver certo. Tabelas sem mapeamento respondem `{ rows: [] }`.
 *
 * O frontend (utils/rpc.ts) pode chamar via session.client OU via fetch direto no
 * proxy; ambos batem na mesma URL `/v1/chain/get_table_rows`, então um único
 * intercept cobre os dois caminhos.
 */
function stubRpcTableRows(tableMap: Record<string, RpcTableEntry> = {}): void {
    cy.intercept('POST', '**/v1/chain/get_table_rows', (req) => {
        // Wharfkit envia o corpo como STRING JSON (não objeto). Sem este parse,
        // req.body.table fica undefined e toda tabela cai no fallback vazio.
        const body  = parseRpcBody(req.body);
        const table = (body.table as string) ?? '';
        const entry = tableMap[table];
        if (typeof entry === 'string') {
            req.reply({ fixture: entry });
        } else if (typeof entry === 'function') {
            req.reply(entry(body) as never);
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

// Referência ao mock server ativo — mock-socket mantém um registro global por URL
// e lança "already listening" se criarmos dois na mesma URL. Paramos o anterior
// antes de criar um novo (defesa contra retries e múltiplos testes na mesma suíte).
let _currentMockServer: MockServer | null = null;

// Flag: o WebSocket mock deve ser injetado no PRÓXIMO window:before:load (ver abaixo).
let _injectMockWs = false;

function stopMockSocket(): void {
    if (_currentMockServer) {
        try { _currentMockServer.stop(); } catch { /* idempotente */ }
        _currentMockServer = null;
    }
    _injectMockWs = false;
}

// Conexões mock-socket ativas — usadas para enviar frames Engine.IO/Socket.IO.
const _mockClients = new Set<{ send: (data: string) => void }>();

/**
 * O frontend usa socket.io-client (Engine.IO v4). Um `server.emit` cru do
 * mock-socket NÃO é decodificado pelo parser do socket.io. Por isso falamos o
 * protocolo na mão sobre o WebSocket mockado:
 *   - handshake EIO: `0{...}` (open) + `40` (connect ao namespace default);
 *   - eventos: `42["<evento>",<payload>]`.
 * Assim os handlers `socket.on('ball_drawn', ...)` do useSlowReveal são acionados.
 */
function emitSocketIoEvent(event: string, payload: unknown): void {
    const frame = `42${JSON.stringify([event, payload])}`;
    for (const client of _mockClients) client.send(frame);
}

// Injeção do WebSocket mock no PRÓXIMO window:before:load.
// Necessário porque o engine.io-client captura o WebSocket global no carregamento
// do bundle — patchar depois (ou no realm do runner) não intercepta. mock-socket
// vive no realm do runner; injetamos a CLASSE mock no window da app (mesmo Network
// singleton do módulo), antes do bundle avaliar. mockSocket DEVE ser chamado ANTES
// do devLogin (que faz o cy.visit inicial). A SPA não recarrega → o patch persiste.
Cypress.on('window:before:load', (win) => {
    if (_injectMockWs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (win as any).WebSocket = MockWebSocket;
    }
});

Cypress.Commands.add('mockSocket', () => {
    // socket.io sobre o endpoint de origin; o transport 'websocket' usa o caminho
    // /socket.io/. mock-socket intercepta a URL de WebSocket no window do app.
    const wsUrl = `ws://127.0.0.1:5173/socket.io/?EIO=4&transport=websocket`;

    stopMockSocket();
    _mockClients.clear();
    _injectMockWs = true;

    const server = new MockServer(wsUrl);
    _currentMockServer = server;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.on('connection', (socket: any) => {
        _mockClients.add(socket);
        // Handshake Engine.IO v4: open packet (sid + parâmetros de ping). NÃO
        // enviamos o `40` aqui — esperamos o cliente pedir conexão de namespace.
        socket.send('0{"sid":"e2e-mock","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
        socket.on('message', (raw: string) => {
            // `40` (connect ao namespace) → respondemos com o sid do namespace.
            if (String(raw).startsWith('40')) socket.send('40{"sid":"e2e-mock-ns"}');
            // ping `2` → pong `3` (mantém a conexão viva).
            else if (raw === '2') socket.send('3');
        });
    });

    // Guarda o server como alias. NÃO retornamos o server (misturaria sync/async).
    return cy.wrap(server, { log: false }).as('mockSocket');
});

// Garante limpeza entre testes — evita "already listening" no beforeEach seguinte.
afterEach(() => {
    stopMockSocket();
    _mockClients.clear();
});

Cypress.Commands.add('emitBall', (n: number) => {
    cy.get<MockServer>('@mockSocket').then(() => {
        const order = (Cypress.env('__ballOrder') ?? 0) + 1;
        Cypress.env('__ballOrder', order);
        // Espelha o handler ball_drawn: { event, game_id, payload: DrawnBall }.
        emitSocketIoEvent('ball_drawn', {
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
    cy.get<MockServer>('@mockSocket').then(() => {
        // Espelha o handler winner_found: { event, game_id, payload: { winning_ball, winners } }.
        emitSocketIoEvent('winner_found', {
            event:   'winner_found',
            game_id: activeGameId(),
            payload,
        });
    });
});

Cypress.Commands.add('emitSocketEvent', (event: string, payload: unknown) => {
    cy.get<MockServer>('@mockSocket').then(() => {
        emitSocketIoEvent(event, payload);
    });
});

// Necessário para que o arquivo seja tratado como módulo (escopo das declarações).
export {};
