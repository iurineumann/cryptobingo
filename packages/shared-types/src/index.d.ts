export type SupportedLocale = 'en-US' | 'pt-BR' | 'es-ES' | 'fr-FR' | 'ru-RU' | 'zh-CN' | 'ja-JP';
export type UserRole = 'player' | 'moderator' | 'sponsor' | 'admin' | 'contract_admin';
export type PatternType = 'regular' | 'combination';
/**
 * FSM do contrato bingo.cpp.
 * Progressão: created → funding → locked → drawing → drawn → archived
 *                                         ↘ aborted (fail-safe)
 * Ref: SPEC.md §1.2, architecture.md FSM
 */
export type GameStatus = 'created' | 'funding' | 'locked' | 'drawing' | 'drawn' | 'archived' | 'aborted';
/**
 * Espelha a tabela `games` do bingo.hpp.
 * Scope: _self. Primary Key: game_id.
 */
export interface BlockchainGameState {
    game_id: string;
    status: GameStatus;
    ticket_price: ExtendedAsset;
    total_wagered: ExtendedAsset;
    sponsor_pool: ExtendedAsset[];
    drawn_balls: number[];
    campaign_id: string;
    gametype_id: string;
    end_time: number;
    room_id: string;
}
/**
 * extended_asset serializado pelo nó Antelope.
 */
export interface ExtendedAsset {
    quantity: string;
    contract: string;
}
/**
 * Espelha a tabela `tickets` do bingo.hpp.
 * Scope: game_id. Primary Key: ticket_id.
 */
export interface BlockchainTicketRecord {
    ticket_id: string;
    owner: string;
    matrix: number[];
    state: number;
    game_id: string;
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
    campaign_id: string;
    sponsor: string;
    total_budget: ExtendedAsset;
    payout_per_game: ExtendedAsset;
    balance_remaining: ExtendedAsset;
    leftover_policy: 'refund' | 'house';
    games_linked: number;
}
/**
 * Espelha a tabela `patterns` do bingo.hpp (ADR-004 Fase 2).
 * Scope: _self. Primary Key: pattern_id.
 */
export interface BlockchainPattern {
    pattern_id: string;
    name: string;
    mask: number;
}
/**
 * Regra de padrão dentro de um gametype.
 */
export interface PatternRule {
    pattern_id: string;
    weight: number;
}
/**
 * Espelha a tabela `gametypes` do bingo.hpp (ADR-004 Fase 2).
 * Scope: _self. Primary Key: gametype_id.
 */
export interface BlockchainGametype {
    gametype_id: string;
    name: string;
    base_multiplier: number;
    rules: PatternRule[];
}
/**
 * Espelha a tabela `rooms` do bingo.hpp (ADR-010).
 * Scope: _self. Primary Key: room_id.
 */
export interface BlockchainRoom {
    room_id: string;
    sponsor: string;
    gametype_id: string;
    currency: {
        quantity: string;
        contract: string;
    };
    ticket_price_min: {
        quantity: string;
        contract: string;
    };
    ticket_price_max: {
        quantity: string;
        contract: string;
    };
    ticket_price_default: {
        quantity: string;
        contract: string;
    };
    weight: string;
    max_tickets_per_player: number;
    current_game_id: string;
    nft_template_allowlist: number[];
    sponsor_room: boolean;
    status: string;
    created_at: number;
    paused_at: number;
}
export interface PostgresUser {
    id: string;
    wallet_address: string;
    role: UserRole;
    kyc_status: 'none' | 'pending' | 'verified';
    created_at: Date;
}
export interface PostgresKycVault {
    id: string;
    user_id: string;
    encrypted_real_name: string;
    encrypted_document: string;
    country_code: string;
}
export interface PostgresGamesHistory {
    game_id: string;
    status: GameStatus;
    drawn_balls: number[];
    total_wagered: number;
    gametype_id: string;
    campaign_id: string;
    resolved_at: Date | null;
    created_at: Date;
}
export interface PostgresTransactionLedger {
    tx_id: string;
    user_id: string;
    game_id: string;
    action_type: 'deposit' | 'withdraw' | 'buy_ticket' | 'claim_win' | 'refund';
    amount: number;
    currency: string;
    timestamp: Date;
}
export interface MongoUserProfile {
    wallet_address: string;
    nickname: string;
    role: UserRole;
    avatar_nft_asset_id: string | null;
    preferences: {
        locale: SupportedLocale;
        currency_display: string;
        sound_enabled: boolean;
    };
    progression: {
        xp: number;
        tier: 'Bronze' | 'Silver' | 'Gold' | 'Diamond';
        games_played: number;
    };
}
export interface MongoChatMessage {
    lobby_id: string;
    wallet_address: string;
    message: string;
    is_sponsor_drop: boolean;
    timestamp: Date;
}
export interface RoomMetadata {
    room_id: string;
    name: string;
    description: string;
    cover_image_url: string;
    rules_summary: string;
    chat_enabled: boolean;
    auto_start_delay_sec: number;
    drops: RoomDropConfig[];
}
export interface RoomDropConfig {
    token_contract: string;
    symbol: string;
    amount: string;
    template_id: number;
    collection_name: string;
    drop_chance_pct: number;
    max_drops_per_game: number;
}
export interface MongoNftCache {
    wallet_address: string;
    assets: Array<{
        asset_id: string;
        schema_name: string;
        name: string;
        backed_tokens: string;
    }>;
    last_synced: Date;
}
//# sourceMappingURL=index.d.ts.map