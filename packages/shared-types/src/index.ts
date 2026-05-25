// ==========================================
// 1. TIPOS GLOBAIS E INTERNACIONALIZAÇÃO (i18n)
// ==========================================
export type SupportedLocale = 'en-US' | 'pt-BR' | 'es-ES' | 'fr-FR' | 'ru-RU' | 'zh-CN' | 'ja-JP';
export type UserRole = 'player' | 'moderator' | 'sponsor' | 'admin';

// ==========================================
// 2. ESTRUTURAS ON-CHAIN (Espelho fiel do bingo.hpp / bingo.abi)
//
// REGRA: Estes tipos devem refletir EXATAMENTE os campos serializados
// pelo CDT (EOSIO Contract Development Toolkit). Qualquer alteração no
// .hpp deve ser imediatamente espelhada aqui.
// ==========================================

/**
 * Espelha o enum de status da FSM do bingo.cpp.
 * Estados possíveis em ordem de progressão:
 *   funding → locked → drawing → drawn → archived
 *                    ↘ aborted (fail-safe)
 */
export type GameStatus =
    | 'funding'   // Vendas abertas (buytickets habilitado)
    | 'locked'    // Vendas encerradas, índice Redis sendo construído
    | 'drawing'   // Requisição de entropia enviada ao orng.wax
    | 'drawn'     // Entropia recebida, drawn_balls preenchido
    | 'archived'  // Prêmio pago, em quarentena de 24h para auditoria
    | 'aborted';  // Fail-safe ativado (timeout de oráculo ou erro de quórum)

/**
 * Espelha a tabela `games` do bingo.hpp.
 * Scope: _self (bingo.game). Primary Key: game_id.
 *
 * Nota sobre sponsor_pool: o campo é serializado como array de extended_asset.
 * Na leitura via get_table_rows com json:true, cada item aparece como
 * objeto { quantity: "N.NNNN SYM", contract: "account" }.
 */
export interface BlockchainGameState {
    game_id: string;                    // uint64 — lido como string para evitar perda de precisão no JS
    status: GameStatus;
    ticket_price: ExtendedAsset;        // extended_asset: { quantity, contract }
    prize_pool: ExtendedAsset;          // extended_asset: { quantity, contract }
    sponsor_pool: ExtendedAsset[];      // vector<extended_asset>
    drawn_balls: number[];              // vector<char> com 75 posições após receiverand()
    campaign_id: string;                // uint64 — '0' se não patrocinado
}

/**
 * Representa um extended_asset serializado pelo nó Antelope.
 * O campo `quantity` segue o formato "AMOUNT SYMBOL" (ex: "10.0000 WAX").
 */
export interface ExtendedAsset {
    quantity: string;   // ex: "10.0000 WAX"
    contract: string;   // ex: "eosio.token"
}

/**
 * Espelha a tabela `tickets` do bingo.hpp.
 * Scope: game_id. Primary Key: ticket_id.
 * Secondary Index: owner (uint64 cast de name) — usado para varredura de reembolso.
 *
 * ATENÇÃO: O campo `state` é um bitmask uint32 usado pelo motor de Bitmasking.
 * Bit 12 inicia setado (FREE SPACE). Não confundir com status de vitória.
 */
export interface BlockchainTicketRecord {
    ticket_id: string;      // uint64
    owner: string;          // name (ex: "jogador1")
    matrix: number[];       // vector<char> com exatas 24 posições [1-75], sem a posição 12 (FREE SPACE)
    state: number;          // uint32 — bitmask de progresso; inicia em 0x00001000 (bit 12 setado)
    game_id: string;        // uint64 — desnormalizado para facilitar queries off-chain
}

/**
 * Espelha a tabela `balances` do bingo.hpp.
 * Scope: account_name (por usuário). Primary Key: symbol_code.raw().
 *
 * A leitura via get_table_rows retorna um registro por token depositado.
 * Não há campo `owner` na linha — o owner é o scope da query.
 */
export interface BlockchainBalance {
    balance: ExtendedAsset; // extended_asset: { quantity, contract }
}

// ==========================================
// 3. POSTGRESQL MODELS (Ledger & Compliance - Lei 14.790/2023)
// ==========================================
export interface PostgresUser {
    id: string;               // UUID
    wallet_address: string;
    role: UserRole;
    kyc_status: 'none' | 'pending' | 'verified';
    created_at: Date;
}

export interface PostgresTransactionLedger {
    tx_id: string;            // Hash da blockchain
    user_id: string;          // UUID ref PostgresUser
    game_id: string;          // ref BlockchainGameState
    action_type: 'deposit' | 'withdraw' | 'buy_ticket' | 'claim_win';
    amount: number;           // Valor decimal puro para somatórios contábeis
    currency: string;         // 'WAX' ou 'BINGO'
    timestamp: Date;
}

// ==========================================
// 4. MONGODB MODELS (Dynamic Edge, Gamification & Chat)
// ==========================================
export interface MongoUserProfile {
    wallet_address: string;   // Chave de ligação
    nickname: string;
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