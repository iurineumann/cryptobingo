// ==========================================
// 1. TIPOS GLOBAIS E INTERNACIONALIZAÇÃO (i18n)
// ==========================================
export type SupportedLocale = 'en-US' | 'pt-BR' | 'es-ES' | 'fr-FR' | 'ru-RU' | 'zh-CN' | 'ja-JP';
export type UserRole = 'player' | 'moderator' | 'sponsor' | 'admin';

// ==========================================
// 2. ESTRUTURAS ON-CHAIN (Espelho do bingo.abi)
// ==========================================
export type GameStatus = 'funding' | 'locked' | 'drawing' | 'drawn' | 'archived';

export interface BlockchainGameState {
    game_id: string;          // uint64 na WAX é lido como string no JS para evitar perda de precisão
    status: GameStatus;
    ticket_price: string;     // ex: "10.0000 BINGO" (asset)
    prize_pool: string;       // ex: "5000.0000 BINGO" (asset)
    drawn_balls: number[];    // array de uint8
}

export interface BlockchainTicketRecord {
    ticket_id: string;        // uint64
    buyer: string;            // name (ex: "jogador1.wax")
    numbers: number[];        // array de uint8 com os números da cartela
    matched_balls: number;    // uint8
    win_status: number;       // uint8 (0 = ativo, 1 = ganhou)
}

export interface BlockchainBalance {
    owner: string;            // name
    balance: string;          // asset
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