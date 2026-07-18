// packages/shared-types/src/index.ts
// Fonte única de verdade para tipagem cross-package do CryptoBingo.
// REGRA: qualquer alteração no bingo.hpp deve ser espelhada aqui na mesma sprint.
// Ref: PROJECT-DETAILS.md §9 (Sincronia de Tipagem)

// ==========================================
// 1. TIPOS GLOBAIS E INTERNACIONALIZAÇÃO (i18n)
// ==========================================
export type SupportedLocale = 'en-US' | 'pt-BR' | 'es-ES' | 'fr-FR' | 'ru-RU' | 'zh-CN' | 'ja-JP';
export type UserRole = 'player' | 'moderator' | 'sponsor' | 'admin' | 'contract_admin';
export type PatternType = 'simple' | 'special' | 'master';

/** Janela de funding (segundos) — tempo máximo de venda antes do lock. Compartilhado worker/frontend. */
export const FUNDING_WINDOW_SEC = 60;

// Permissões granulares (ADR-036)
export type AdminPermission =
  | 'admin.dashboard.view'
  | 'admin.rooms.manage'
  | 'admin.patterns.manage'
  | 'admin.gametypes.manage'
  | 'admin.users.view'
  | 'admin.users.manage'
  | 'admin.sponsors.view'
  | 'admin.sponsors.manage'
  | 'admin.tokens.manage'
  | 'admin.nfts.manage'
  | 'admin.campaigns.manage'
  | 'admin.vault.manage'
  | 'admin.compliance.view'
  | 'admin.news.manage'
  | 'admin.config.manage'
  | 'admin.content.*'
  | `admin.content.${string}.${'view' | 'create' | 'edit' | 'publish' | 'delete' | 'translate'}`;

export type SponsorPermission =
  | `sponsor.${string}.dashboard.view`
  | `sponsor.${string}.rooms.manage`
  | `sponsor.${string}.rooms.${string}.manage`
  | `sponsor.${string}.nfts.manage`
  | `sponsor.${string}.treasury.view`
  | `sponsor.${string}.treasury.withdraw`
  | `sponsor.${string}.drops.manage`
  | `sponsor.${string}.campaigns.manage`
  | `sponsor.${string}.layouts.manage`
  | `sponsor.${string}.delegations.manage`;

export type Permission = AdminPermission | SponsorPermission | 'admin.*';

export interface SponsorOrgDocument {
  orgId: string;
  owner_wallet: string;
  name: string;
  settings: { autoApproveDelegations: boolean };
  createdAt: Date;
  updatedAt: Date;
}

export interface SponsorDelegationDocument {
  orgId: string;
  wallet_address: string;
  permissions: Permission[];
  delegated_by: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Modos de sorteio do gametype (ADR-012).
 * Espelha os valores de draw_mode no contrato (eosio::name, max 12 chars).
 */
export type DrawMode = 'standard' | 'fixed' | 'firstfull' | 'goldenball' | 'multimatch';

// ==========================================
// 2. ESTRUTURAS ON-CHAIN (Espelho fiel do bingo.hpp / bingo.abi)
// ==========================================

/**
 * FSM do contrato bingo.cpp.
 * Progressão: created → funding → locked → drawing → drawn → paying → archived
 *                                         ↘ aborted (fail-safe; aceita: locked|drawing|paying)
 * Ref: SPEC.md §1.2, ADR-012 §1, architecture.md FSM
 */
export type GameStatus =
    | 'created'   // Jogo agendado, aguardando fundgame()
    | 'funding'   // Vendas abertas (buytickets habilitado)
    | 'locked'    // Vendas encerradas
    | 'drawing'   // Requisição de entropia enviada ao orng.wax
    | 'drawn'     // Entropia recebida, drawn_balls preenchido
    | 'paying'    // Pagando vencedores (multi-winner — ADR-012)
    | 'archived'  // Todos os prêmios pagos, em quarentena de 24h
    | 'aborted';  // Fail-safe ativado (timeout de oráculo ou admin halt)

/**
 * Espelha a tabela `games` do bingo.hpp.
 * Scope: _self. Primary Key: game_id.
 */
export interface BlockchainGameState {
    game_id:          string;            // uint64 como string
    status:           GameStatus;
    ticket_price:     ExtendedAsset;
    total_wagered:    ExtendedAsset;
    sponsor_pool:     ExtendedAsset[];   // vector<extended_asset>
    drawn_balls:      number[];          // 75 posições após receiverand()
    campaign_id:      string;            // uint64 — '0' se não patrocinado
    gametype_id:      string;            // uint64 — '0' se modo legado
    end_time:         number;            // time_point_sec — 0 até closegame/abortgame
    room_id:          string;            // uint64 — '0' se jogo avulso
    golden_ball_num:  number;            // ADR-012: 1-75, 0=sem golden ball
    golden_multiplier: number;           // ADR-012: multiplicador (0=sem efeito)
    total_paid:       number;            // ADR-005: soma dos payouts executados (int64)
    funded_at?:       number;            // ADR-056: epoch sec do início do funding (binary_extension no contrato; opcional p/ linhas legadas)
}

/**
 * extended_asset serializado pelo nó Antelope.
 */
export interface ExtendedAsset {
    quantity: string;   // "10.0000 WAX"
    contract: string;   // "eosio.token"
}

/**
 * Espelha a tabela `tickets` do bingo.hpp.
 * Scope: game_id. Primary Key: ticket_id.
 */
export interface BlockchainTicketRecord {
    ticket_id: string;         // uint64
    owner:     string;         // name
    matrix:    number[];       // 24 posições coluna-maior [B0-B4,I0-I4,N0,N1,N3,N4,G0-G4,O0-O4]
    state:     number;         // uint32 bitmask; inicia em 0x00001000 (bit 12 = FREE SPACE)
    game_id:   string;         // uint64
    price?:    ExtendedAsset;  // preço efetivo pago — preenchido desde ADR-010 variable pricing
}

/**
 * Espelha a tabela `balances` do bingo.hpp.
 * Scope: account_name. Primary Key: symbol_code.raw().
 */
export interface BlockchainBalance {
    balance: ExtendedAsset;
}

/**
 * Espelha a tabela `campaigns` do bingo.hpp (SPEC.md §1.4).
 * Scope: _self. Primary Key: campaign_id.
 *
 * leftover_policy: "refund" → devolve ao sponsor; "house" → tesouraria
 */
export interface BlockchainCampaign {
    campaign_id:        string;        // uint64
    sponsor:            string;        // name da conta patrocinadora
    total_budget:       ExtendedAsset; // Budget total depositado
    payout_per_game:    ExtendedAsset; // Fração injetada por linkgame()
    balance_remaining:  ExtendedAsset; // Saldo ainda disponível
    leftover_policy:    'refund' | 'house';
    games_linked:       number;        // Contador de jogos vinculados
}

/**
 * Espelha a tabela `patterns` do bingo.hpp (ADR-004 Fase 2).
 * Scope: _self. Primary Key: pattern_id.
 */
export interface BlockchainPattern {
    pattern_id: string;
    name:       string;
    mask:       number; // uint32 bitmask (max 25 bits)
}

/**
 * Regra de padrão dentro de um gametype.
 */
export interface PatternRule {
    pattern_id: string;
    weight:     number; // uint16 (hundredths, 1.00=100)
}

/**
 * Estágio progressivo do modo MULTI_MATCH (ADR-013).
 * Espelha o struct `stage_rule` do bingo.hpp.
 */
export interface StageRule {
    stage:              number; // uint8 — 1, 2, 3... (ordenado)
    patterns_required:  number; // uint8 — nº de padrões completados para ganhar este estágio
    weight:             number; // uint16 — peso do prêmio em hundredths
}

/**
 * Espelha a tabela `gametypes` do bingo.hpp (ADR-004 Fase 2, ADR-012).
 * Scope: _self. Primary Key: gametype_id.
 */
export interface BlockchainGametype {
    gametype_id:        string;
    name:               string;
    base_multiplier:    number;      // uint8
    rules:              PatternRule[];
    draw_mode:          DrawMode;    // ADR-012
    max_balls:          number;      // ADR-012: bolas sorteadas (0 = 35 padrão)
    golden_ball_after:  number;      // ADR-012: GOLDEN_BALL
    master_weight_ovrd: number;      // ADR-012: FIRST_FULL
    stages:             StageRule[]; // ADR-013: MULTI_MATCH (vazio = não é multi-match)
}

/**
 * Espelha a tabela `rooms` do bingo.hpp (ADR-010).
 * Scope: _self. Primary Key: room_id.
 */
export interface BlockchainRoom {
    room_id:                string;
    sponsor:                string;
    gametype_id:            string;
    currency:               { quantity: string; contract: string };
    ticket_price_min:       { quantity: string; contract: string };
    ticket_price_max:       { quantity: string; contract: string };
    ticket_price_default:   { quantity: string; contract: string };
    weight:                 string;
    max_tickets_per_player: number;
    current_game_id:        string;
    nft_template_allowlist: number[];
    sponsor_room:           boolean;
    status:                 string;
    created_at:             number;
    paused_at:              number;
}

// ==========================================
// 3. POSTGRESQL MODELS (Ledger & Compliance — Lei 14.790/2023)
// Ref: architecture.md §6.1, COMPLIANCE.md §2
// ==========================================

export interface PostgresUser {
    id:             string; // UUID
    wallet_address: string;
    role:           UserRole;
    kyc_status:     'none' | 'pending' | 'verified';
    created_at:     Date;
}

export interface PostgresKycVault {
    id:                     string; // UUID
    user_id:                string; // FK → PostgresUser.id
    encrypted_real_name:    string; // AES-256 at rest
    encrypted_document:     string; // AES-256 at rest
    country_code:           string;
}

export interface PostgresGamesHistory {
    game_id:          string;   // Sincronizado com on-chain
    status:           GameStatus;
    drawn_balls:      number[];
    total_wagered:    number;
    gametype_id:      string;
    campaign_id:      string;
    resolved_at:      Date | null;
    created_at:       Date;
}

export interface PostgresTransactionLedger {
    tx_id:       string; // Hash da transação on-chain
    user_id:     string; // FK → PostgresUser.id
    game_id:     string; // FK → PostgresGamesHistory.game_id
    action_type: 'deposit' | 'withdraw' | 'buy_ticket' | 'claim_win' | 'refund';
    amount:      number; // Decimal para somatórios contábeis
    currency:    string; // 'WAX', 'BINGO', 'TLM', etc.
    timestamp:   Date;
}

// ==========================================
// 4. MONGODB MODELS (Dynamic Edge, Gamification & Chat)
// Ref: architecture.md §6.2
// ==========================================

export interface MongoUserProfile {
    wallet_address:     string;
    nickname:           string;
    role:               UserRole;
    permissions:        Permission[];
    avatar_nft_asset_id: string | null;
    preferences: {
        locale:           SupportedLocale;
        currency_display: string;
        sound_enabled:    boolean;
        rpc_url:          string;
        explorer_url:     string;
    };
    progression: {
        xp:           number;
        tier:         'Cobre' | 'Bronze' | 'Prata' | 'Ouro' | 'Platina' | 'Esmeralda' | 'Safira' | 'Rubi' | 'Diamante';
        level:        number;
        sub_level:    number;
        games_played: number;
        wins_count?:   number;
        combos_count?: number;
        tickets_bought?: number;
        burns_count?:  number;
        next_level_xp?:  number;
        xp_to_next_level?: number;
        progress_pct?:   number;
    };
    achievements?: AchievementEntry[];
}

export interface MongoChatMessage {
    lobby_id:       string;
    wallet_address: string;
    message:        string;
    is_sponsor_drop: boolean;
    timestamp:      Date;
}

export interface RoomMetadata {
    room_id:              string;
    name:                 string;
    description:          string;
    cover_image_url:       string;
    rules_summary:        string;
    chat_enabled:         boolean;
    auto_start_delay_sec: number;
    drops:                RoomDropConfig[];
}

export interface RoomDropConfig {
    token_contract:    string;
    symbol:            string;
    amount:            string;
    template_id:       number;
    collection_name:   string;
    drop_chance_pct:   number;
    max_drops_per_game: number;
}

export interface MongoNftCache {
    wallet_address: string;
    assets: Array<{
        asset_id:       string;
        schema_name:    string;
        name:           string;
        backed_tokens:  string; // "10000.0000 BINGO"
        template_id:    number;
        collection_name: string;
        img_url?:       string; // IPFS gateway URL p/ imagem da NFT
    }>;
    last_synced: Date;
}

// ── Drop Vault — Tipos On-Chain (ADR-011) ─────────────────────────────────────
// Correspondem às tabelas dropdeposits, dropallocs e singleton dropstate
// definidas em bingo.hpp. Usados pelo dropWorker, dropController e frontend.

export interface BlockchainDropDeposit {
    deposit_id:          string;
    owner:               string;
    asset_type:          'token' | 'nft';
    token_contract:      string;
    token_symbol:        string;
    quantity_original:   ExtendedAsset;
    quantity_remaining:  ExtendedAsset;
    nft_asset_id:        string;
    nft_template_id:     number;
    nft_collection:      string;
    status:              'deposited' | 'active' | 'draining' | 'exhausted' | 'reclaimed';
    deposited_at:        number; // Unix timestamp (seconds)
}

export interface BlockchainDropAllocation {
    alloc_id:              string;
    deposit_id:            string;
    owner:                 string;
    room_id:               string;
    asset_type:            'token' | 'nft';
    token_contract:        string;
    token_symbol:          string;
    quantity_per_drop:     ExtendedAsset;
    quantity_distributed:  ExtendedAsset;
    nft_asset_id:          string;
    nft_template_id:       number;
    nft_collection:        string;
    drop_chance_bps:       number; // 1–10000 (100 = 1%)
    drops_executed:        number;
    status:                'active' | 'deallocated' | 'exhausted';
    allocated_at:          number; // Unix timestamp (seconds)
}

export interface BlockchainDropState {
    next_deposit_id:       string;
    next_alloc_id:         string;
    player_base_chance_bps: number; // Chance base por jogador (default 5000 = 50%)
}

// ── bingogameswp — Tipos On-Chain (ADR-018) ─────────────────────────────────────
// Correspondem às tabelas swapstate, allowedtoks, pools, pending e lpbalances
// definidas em contracts/swap/include/swap.hpp.

/** Espelha o singleton `swapstate` do swap.hpp. Scope: get_self(). */
export interface BlockchainSwapState {
    next_pool_id:  string; // uint64 como string
    next_token_id: string; // uint64 como string
    treasury:      string; // name — conta que recebe as service fees (default: bingogamectr)
}

/** Espelha a tabela `allowedtoks` do swap.hpp. Scope: get_self(). */
export interface BlockchainAllowedToken {
    id:  string;          // uint64 como string
    sym: {
        sym:      string; // ex: "4,WAX"
        contract: string; // ex: "eosio.token"
    };
}

/**
 * Espelha a tabela `pools` do swap.hpp. Scope: get_self(). Primary Key: pool_id.
 * sym_a tem menor symbol_code.raw() que sym_b (ordem canônica).
 */
export interface BlockchainSwapPool {
    pool_id:          string; // uint64 como string
    sym_a:            { sym: string; contract: string };
    sym_b:            { sym: string; contract: string };
    reserve_a:        string; // int64 como string — unidades mínimas do token A
    reserve_b:        string; // int64 como string — unidades mínimas do token B
    lp_supply:        string; // int64 como string — total LP emitido
    fee_bps:          number; // uint16 — taxa LP em bps (30 = 0.30%), fica no pool
    service_fee_bps:  number; // uint16 — taxa de serviço em bps, vai para treasury (ADR-019)
}

/**
 * Espelha a tabela `pending` do swap.hpp. Scope: account.
 * deposit_a.quantity.amount == "0" se o token A ainda não foi depositado.
 */
export interface BlockchainPendingDeposit {
    pool_id:    string; // uint64 como string
    deposit_a:  ExtendedAsset;
    deposit_b:  ExtendedAsset;
    expires_at: number; // Unix timestamp (seconds)
}

/** Espelha a tabela `lpbalances` do swap.hpp. Scope: account. */
export interface BlockchainLpBalance {
    pool_id: string; // uint64 como string
    amount:  string; // int64 como string
}

/** Espelha a tabela `nftdiscounts` do swap.hpp (ADR-019 Phase 2). */
export interface BlockchainNftDiscount {
    template_id:  number; // int32 — AtomicAssets template_id
    discount_bps: number; // uint16 — 1000 = 10% de desconto na service_fee
}

// ── bingogameswp — Cotação de Checkout Multi-Moeda (ADR-021) ────────────────────

/**
 * Resposta de GET /api/v1/swap/quote.
 * Contém todos os dados necessários para o frontend exibir a cotação ao usuário
 * e construir a transação Wharfkit de 3 ações (swap + deposit + buytickets).
 */
export interface SwapQuote {
    quote_id:                   string;   // UUID — rastreabilidade em logs
    pool_id:                    string;   // uint64 como string
    from_contract:              string;   // ex: "bingogametkn"
    from_symbol:                string;   // ex: "4,BINGO"
    to_contract:                string;   // ex: "eosio.token"
    to_symbol:                  string;   // ex: "8,WAX"
    amount_in:                  string;   // quantidade exata a enviar (unidades mínimas como string)
    amount_in_display:          string;   // ex: "123.4567 BINGO"
    amount_out:                 string;   // quantidade recebida (unidades mínimas como string)
    amount_out_display:         string;   // ex: "10.00000000 WAX"
    min_out:                    string;   // amount_out com margem de slippage 0.5%
    fee_bps:                    number;   // taxa LP em bps
    service_fee_bps:            number;   // taxa de serviço em bps (ADR-019)
    effective_service_fee_bps:  number;   // service_fee_bps após NFT discount (ADR-019 Phase 2)
    nft_discount_bps:           number;   // 0 se sem desconto; 1000 = 10% off
    price_impact_pct:           number;   // impacto no pool em %
    expires_at:                 number;   // Unix timestamp (seconds)
}

/**
 * Pool resumida retornada por GET /api/v1/swap/pools.
 * Subconjunto de BlockchainSwapPool enriquecido com símbolos legíveis.
 */
export interface SwapPoolSummary {
    pool_id:         string;
    token_a:         { contract: string; symbol: string; precision: number };
    token_b:         { contract: string; symbol: string; precision: number };
    reserve_a:       string; // int64 como string
    reserve_b:       string;
    fee_bps:         number;
    service_fee_bps: number;
}

// ── Achievement Definitions (ADR-028 2D) ─────────────────────────────────────

/**
 * Definição de uma conquista no sistema de progressão.
 * Fonte: achievementEngine.ts (worker-game-loop).
 */
export interface AchievementDefinition {
    id:    string;
    label: string;
    desc:  string;
    icon:  string;
}

/**
 * Conquista desbloqueada por um jogador.
 * Armazenada em MongoUserProfile.achievements[] como subdocumento.
 */
export interface AchievementEntry {
    id:          string;
    unlocked_at: Date;
}

// ── Rankings & Conteúdo (ADR-024) ────────────────────────────────────────────

/**
 * Entrada no ranking de vencedores. Fonte: PostgreSQL transactions_ledger
 * (action_type = 'claim_win') + nickname do perfil Mongo.
 */
export interface LeaderboardEntry {
    rank:      number;
    wallet:    string;
    nickname:  string | null;
    total_won: number;   // soma dos claim_win (unidades da moeda como number)
    currency:  string;   // 'WAX', 'BINGO', 'TLM', etc.
    games_won: number;   // número de transações claim_win
    room_id?:  string;   // presente apenas no leaderboard por sala
}

/**
 * Entrada no ranking de XP. Fonte: MongoDB userprofiles (progression.xp).
 */
export interface LeaderboardXpEntry {
    rank:       number;
    wallet:     string;
    nickname:   string | null;
    xp:         number;
    tier:       string;
    level:      number;
    games_played: number;
}

/**
 * Item de conteúdo unificado. Collection 'content' no MongoDB.
 * content_format define se o campo content é texto plano ou JSON de blocks do BlockNote.
 * locale_overrides segue mesmo formato do content (text ou blocks).
 */
export interface ContentItem {
    id:               string;
    type:             'faq' | 'howitworks' | 'sponsors' | 'tutorials' | 'news';
    slug:             string;
    title:            string;
    content_format:   'text' | 'blocks';
    content:          string | unknown[];   // string para text, PartialBlock[] para blocks
    image_url:        string | null;
    metadata:         Record<string, unknown> | null;
    pinned:           boolean;
    sort_order:       number;
    locale_overrides: Partial<Record<'en-US' | 'zh-CN', { title: string; content: string | unknown[] }>>;
    active:           boolean;
    published_at:     string;
    published_by:     string;
}

/**
 * Publicação de notícia/promoção. Armazenada em MongoDB (coleção news_feed).
 * Soft delete: active=false oculta da listagem pública.
 * @deprecated Migrando para ContentItem (collection content). Manter para compat.
 */
export interface NewsItem {
    id:               string;
    title:            string;
    content:          string;
    image_url:        string | null;
    locale_overrides: Partial<Record<'en-US' | 'zh-CN', { title: string; content: string }>>;
    active:           boolean;
    pinned:           boolean;
    published_at:     string;   // ISO 8601
    published_by:     string;   // wallet do admin
}

// ──────────────────────────────────────────────────────────────────────────────
// Prize Pipeline — transações de premiação e buy-in (Prize Pipeline)
// ──────────────────────────────────────────────────────────────────────────────

export interface PrizeTx {
    gameId:    string;
    account:   string;
    ticketId:  string;
    winType:   'pattern' | 'combo' | 'stage';
    patternMask?: string;
    comboId?:    number;
    stageNumber?: number;
    winLabel:     string;
    weight:       number;
    amount:       string;
    currency:     string;
    transactionId?: string;
    goldenMultiplier?: number;
    ticketPrice: string;
    claimedAt:   string;
}

export interface BuyInTx {
    gameId:      string;
    account:     string;
    ticketId:    string;
    amount:      string;
    currency:    string;
    purchasedAt: string;
}
