import type { MongoUserProfile, PatternType } from '@cryptobingo/shared-types';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL + '/api/v1';

let _token: string | null = sessionStorage.getItem('cb_jwt');

export function setAuthToken(token: string): void {
    _token = token;
    sessionStorage.setItem('cb_jwt', token);
}

export function clearAuthToken(): void {
    _token = null;
    sessionStorage.removeItem('cb_jwt');
}

export function getAuthToken(): string | null {
    return _token;
}

function authHeaders(): HeadersInit {
    if (!_token) throw new Error('Usuário não autenticado. Faça login primeiro.');
    return {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${_token}`,
    };
}

function publicHeaders(): HeadersInit {
    return { 'Content-Type': 'application/json' };
}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
}

// ==========================================
// AUTH — Challenge-Response (ADR-006)
// ==========================================

interface ChallengeResponse {
    nonce:      string;
    expires_at: string;
    message:    string;
}

interface VerifyResponse {
    token: string;
}

export async function requestAuthChallenge(wallet: string): Promise<ChallengeResponse> {
    const res = await fetch(`${API_BASE}/auth/challenge`, {
        method:  'POST',
        headers: publicHeaders(),
        body:    JSON.stringify({ wallet }),
    });
    return handleResponse<ChallengeResponse>(res);
}

export async function verifyAuthChallenge(
    wallet:              string,
    nonce:               string,
    signature:           string,
    publicKey:           string,
    transactionPayload?: unknown,
): Promise<string> {
    const res = await fetch(`${API_BASE}/auth/verify`, {
        method:  'POST',
        headers: publicHeaders(),
        body: JSON.stringify({
            wallet,
            nonce,
            signature,
            public_key: publicKey,
            ...(transactionPayload !== undefined && { transactionPayload }),
        }),
    });
    const data = await handleResponse<VerifyResponse>(res);
    setAuthToken(data.token);
    return data.token;
}

// ==========================================
// PERFIL (protegido por JWT)
// ==========================================

export async function fetchUserProfile(): Promise<MongoUserProfile> {
    const res = await fetch(`${API_BASE}/profile`, {
        headers: authHeaders(),
    });
    return handleResponse<MongoUserProfile>(res);
}

export async function updateUserLocale(locale: string): Promise<MongoUserProfile> {
    const res = await fetch(`${API_BASE}/profile`, {
        method:  'PUT',
        headers: authHeaders(),
        body:    JSON.stringify({ locale }),
    });
    return handleResponse<MongoUserProfile>(res);
}

// ==========================================
// CARTELAS — Geração e Assinatura (ADR-001)
// ==========================================

export interface SignedTicket {
    matrix:    number[];
    signature: string;
}

export interface GenerateTicketsResponse {
    game_id: string;
    account: string;
    count:   number;
    tickets: SignedTicket[];
}

export async function generateSignedTickets(
    gameId: string,
    count: number,
    nftId?: string,
): Promise<GenerateTicketsResponse> {
    const res = await fetch(`${API_BASE}/games/${gameId}/tickets/generate`, {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({ count, ...(nftId && nftId !== '0' ? { nft_id: nftId } : {}) }),
    });
    return handleResponse<GenerateTicketsResponse>(res);
}

// ==========================================
// ADMIN — GAMETYPES (RBAC: admin)
// ==========================================

export interface BlockchainPattern {
    pattern_id: string;
    name: string;
    mask: number;
}

export type DrawMode = 'standard' | 'fixed' | 'firstfull' | 'goldenball' | 'multimatch';

export interface StageRule {
    stage:             number; // 1, 2, 3...
    patterns_required: number; // nº de padrões a completar
    weight:            number; // hundredths (100 = 1×)
}

export interface BlockchainGametype {
    gametype_id:        string;
    name:               string;
    base_multiplier:    number;
    rules:              Array<{ pattern_id: string; weight: number }>;
    draw_mode:          DrawMode;    // ADR-012
    max_balls:          number;      // ADR-012: FIXED mode
    golden_ball_after:  number;      // ADR-012: GOLDEN_BALL mode
    master_weight_ovrd: number;      // ADR-012: FIRST_FULL mode
    stages:             StageRule[]; // ADR-013: MULTI_MATCH
}

export async function fetchAdminPatterns(): Promise<{ patterns: BlockchainPattern[] }> {
    const res = await fetch(`${API_BASE}/admin/patterns`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function createAdminPattern(data: { pattern_id: number; name: string; mask: number }): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/admin/patterns`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function deleteAdminPattern(patternId: string): Promise<void> {
    await fetch(`${API_BASE}/admin/patterns/${patternId}`, {
        method: 'DELETE', headers: authHeaders(),
    });
}

export async function fetchAdminGametypes(): Promise<{ gametypes: BlockchainGametype[] }> {
    const res = await fetch(`${API_BASE}/admin/gametypes`, { headers: authHeaders() });
    return handleResponse(res);
}

export interface ExtendedRule {
    pattern_id: string;
    weight:     number;
    type:       PatternType;
}

export interface CombinationClauseInput {
    type: 'all_of' | 'any_of' | 'n_of_type';
    pattern_ids?:  string[];
    pattern_type?: PatternType;
    count?:        number;
}

export interface CombinationRuleInput {
    name:     string;
    weight:   number;
    clauses:  CombinationClauseInput[];
}

export async function createAdminGametype(data: {
    gametype_id: number; name: string; base_multiplier: number;
    rules: Array<{ pattern_id: string; weight: number }>;
    rules_extended?: ExtendedRule[];
    combinations?: CombinationRuleInput[];
    draw_mode?: DrawMode;         // ADR-012
    max_balls?: number;           // ADR-012: FIXED mode
    golden_ball_after?: number;   // ADR-012: GOLDEN_BALL mode
    master_weight_ovrd?: number;  // ADR-012: FIRST_FULL mode
}): Promise<{ gametype_id: number; transaction_id: string }> {
    const res = await fetch(`${API_BASE}/admin/gametypes`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function updateAdminGametype(
    gametypeId: string,
    data: {
        name: string; base_multiplier: number;
        rules: Array<{ pattern_id: string; weight: number }>;
        draw_mode?: DrawMode;
        max_balls?: number;
        golden_ball_after?: number;
        master_weight_ovrd?: number;
    },
): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/admin/gametypes/${gametypeId}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function deleteAdminGametype(gametypeId: string): Promise<void> {
    await fetch(`${API_BASE}/admin/gametypes/${gametypeId}`, {
        method: 'DELETE', headers: authHeaders(),
    });
}

export async function setAdminGametypeStages(
    gametypeId: string,
    stages: StageRule[],
): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/admin/gametypes/${gametypeId}/stages`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ stages }),
    });
    return handleResponse(res);
}

export async function fetchPublicGametypeMetadata(gametypeId: string): Promise<{
    gametype_id:  string;
    rules:        ExtendedRule[];
    combinations: CombinationRuleInput[];
}> {
    const res = await fetch(`${API_BASE}/gametypes/${gametypeId}/metadata`);
    if (!res.ok) return { gametype_id: gametypeId, rules: [], combinations: [] };
    return res.json();
}

export async function fetchGametypeMetadata(gametypeId: string): Promise<{
    gametype_id:  string;
    rules:        ExtendedRule[];
    combinations: CombinationRuleInput[];
}> {
    const res = await fetch(`${API_BASE}/admin/gametypes/${gametypeId}/metadata`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function upsertGametypeMetadata(gametypeId: string, data: {
    rules:        ExtendedRule[];
    combinations: CombinationRuleInput[];
}): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/gametypes/${gametypeId}/metadata`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Erro HTTP ${res.status} ao salvar metadados.`);
    }
}

// ==========================================
// ADMIN — MONTE CARLO SIMULATION
// ==========================================

export interface McPatternInput {
    pattern_id:   number;
    name:         string;
    mask:         number;
    weight:       number;
    pattern_type?: string;  // 'simple' | 'special' | 'master' — usado por combos n_of_type
}

export interface McCombinationClauseInput {
    type:          'all_of' | 'any_of' | 'n_of_type';
    pattern_ids?:  string[];
    pattern_type?: string;
    count?:        number;
}

export interface McCombinationInput {
    name:    string;
    weight:  number;
    clauses: McCombinationClauseInput[];
}

export interface McPatternStats {
    name:             string;
    mask:             number;
    weight:           number;
    hit_count:        number;
    hit_rate:         number;
    avg_balls_needed: number;
}

export interface McResult {
    gametype_name:         string;
    simulations:           number;
    tickets_per_game:      number;
    ticket_price:          number;
    base_multiplier:       number;
    rtp:                   number;
    rtp_pct:               string;
    ggr:                   number;
    ggr_pct:               string;
    total_wagered:         number;
    total_paid_out:        number;
    avg_payout_per_game:   number;
    avg_winners_per_game:  number;
    pattern_stats:         McPatternStats[];
    alerts:                string[];
    is_viable:             boolean;
    duration_ms:           number;
    computed_at:           string;
}

export async function simulateWeights(data: {
    gametype_name:   string;
    base_multiplier: number;
    patterns:        McPatternInput[];
    combinations?:   McCombinationInput[];
    simulations?:    number;
    max_balls?:      number;  // limita o sorteio por rodada (default = 75 = todas as bolas)
}): Promise<McResult> {
    const res = await fetch(`${API_BASE}/admin/simulate-weights`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ...data, simulations: data.simulations ?? 5_000 }),
    });
    return handleResponse(res);
}

export interface CalibrateResult {
    gametype_name:       string;
    target_rtp:          number;
    algebraic_rtp:       number;
    algebraic_rtp_pct:   string;
    iterations:          number;
    converged:           boolean;
    pattern_weights:     Record<string, number>;  // name → hundredths
    combo_weights:       Record<string, number>;
    calibrations:        Array<{ name: string; probability: number; weight: number }>;
    validation:          McResult;
    refinement_iters:     number;   // Fase 3b
    refinement_converged: boolean;
    retries:              number;
    duration_ms:         number;
    computed_at:         string;
}

/**
 * Motor de calibração em 4 fases (backend):
 * Fase1: descoberta empírica → Fase2: Laplace → Fase3: algébrico → Fase4: validação.
 * Substitui o loop de simulateWeights no frontend — uma única chamada estável.
 */
export async function calibrateWeightsApi(data: {
    gametype_name:    string;
    base_multiplier:  number;
    patterns:         McPatternInput[];
    combinations?:    McCombinationInput[];
    tickets_per_game?: number;
    max_balls?:       number;
    target_rtp?:      number;
    discovery_sims?:  number;
    alpha?:           number;
    tolerance?:       number;
    validation_sims?: number;
}): Promise<CalibrateResult> {
    const res = await fetch(`${API_BASE}/admin/calibrate-weights`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse<CalibrateResult>(res);
}

// ── Suggest Combos (unificado) ────────────────────────────────────────────────
// ADR-020: geração hierárquica de combos + calibração em uma única chamada.

export interface SuggestComboItem {
    name:    string;
    weight:  number;
    clauses: McCombinationClauseInput[];
}

export interface SuggestCombosResult {
    gametype_name:   string;
    pattern_weights: Record<string, number>;
    combos:          SuggestComboItem[];
    combo_weights:   Record<string, number>;
    validation:      McResult;
    is_viable:       boolean;
    alerts:          string[];
    duration_ms:     number;
    computed_at:     string;
}

export async function suggestCombosApi(data: {
    gametype_name:    string;
    base_multiplier:  number;
    patterns:         McPatternInput[];
    draw_mode?:       string;
    tickets_per_game?: number;
    max_balls?:       number;
}): Promise<SuggestCombosResult> {
    const res = await fetch(`${API_BASE}/admin/suggest-combos`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse<SuggestCombosResult>(res);
}

// ==========================================
// ADMIN — STATISTICS / COMPLIANCE
// ==========================================

export interface RtpReport {
    period: string;
    total_games: number;
    total_wagered: number;
    total_paid_out: number;
    total_ggr: number;
    avg_rtp_display: string;
    avg_ggr_display: string;
    currency: string;
    generated_at: string;
}

export async function fetchRtpReport(periodDays = 30): Promise<RtpReport> {
    const res = await fetch(`${API_BASE}/statistics/rtp?periodDays=${periodDays}`);
    return handleResponse<RtpReport>(res);
}

export interface GameHistoryEntry {
    game_id: string;
    status: string;
    total_wagered: number;
    total_paid_out: number;
    rtp_pct: number;
    resolved_at: string | null;
}

export async function fetchGamesHistory(limit = 50): Promise<{ games: GameHistoryEntry[] }> {
    const res = await fetch(`${API_BASE}/statistics/games?limit=${limit}`);
    return handleResponse(res);
}

// ==========================================
// SPONSORS / CAMPAIGNS (B2B)
// ==========================================

export interface BlockchainCampaign {
    campaign_id: string;
    sponsor: string;
    budget: { quantity: string; contract: string };
    remaining: { quantity: string; contract: string };
    payout_per_game: { quantity: string; contract: string };
    status: string;
    leftover_policy: string;
}

export async function fetchCampaigns(): Promise<{ campaigns: BlockchainCampaign[] }> {
    const res = await fetch(`${API_BASE}/sponsors/campaigns`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function fetchCampaign(campaignId: string): Promise<BlockchainCampaign> {
    const res = await fetch(`${API_BASE}/sponsors/campaigns/${campaignId}`, { headers: authHeaders() });
    return handleResponse<BlockchainCampaign>(res);
}

export async function linkCampaignToGame(campaignId: string, gameId: string): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/sponsors/campaigns/${campaignId}/link`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ game_id: gameId }),
    });
    return handleResponse(res);
}

export async function closeCampaign(campaignId: string): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/sponsors/campaigns/${campaignId}/close`, {
        method: 'POST', headers: authHeaders(),
    });
    return handleResponse(res);
}

// ==========================================
// NFTS
// ==========================================

export interface NftAsset {
    asset_id: string;
    collection_name: string;
    schema_name: string;
    template_id: string;
    name: string;
    img_url: string;
}

export async function fetchMyNfts(): Promise<{ nfts: NftAsset[] }> {
    const res = await fetch(`${API_BASE}/nfts/my-assets`, { headers: authHeaders() });
    return handleResponse(res);
}

export interface EligibleDiscountNft {
    asset_id:            string;
    template_id:         number;
    collection_name:     string;
    discount_hundredths: number;
    discount_pct:        number; // float para exibição (ex: 5.0 = 5%)
    value_origin:        number; // 0=FIXED, 1=SCHEMA_FIELD
}

export async function fetchEligibleDiscountNfts(): Promise<{ nfts: EligibleDiscountNft[] }> {
    const res = await fetch(`${API_BASE}/nfts/eligible-discount`, { headers: authHeaders() });
    return handleResponse(res);
}

// ==========================================
// WINNINGS
// ==========================================

export interface GameWinningsResponse {
    gameId: string;
    wallet: string;
    totalWon: number;
}

export interface BatchWinningsResponse {
    winnings: Record<string, number>;
}

export async function fetchGameWinnings(gameId: string): Promise<GameWinningsResponse> {
    const res = await fetch(`${API_BASE}/player/winnings/${gameId}`, {
        headers: authHeaders(),
    });
    return handleResponse<GameWinningsResponse>(res);
}

export async function fetchBatchWinnings(gameIds: string[]): Promise<BatchWinningsResponse> {
    const res = await fetch(`${API_BASE}/player/winnings/batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ gameIds }),
    });
    return handleResponse<BatchWinningsResponse>(res);
}

// ==========================================
// ACHIEVEMENTS (ADR-028 2D)
// ==========================================

export interface AchievementDef {
    id:       string;
    label:    string;
    desc:     string;
    icon:     string;
    unlocked: boolean;
}

export interface AchievementsResponse {
    achievements: AchievementDef[];
}

export async function fetchAchievements(): Promise<AchievementsResponse> {
    const res = await fetch(`${API_BASE}/profile/achievements`, {
        headers: authHeaders(),
    });
    return handleResponse<AchievementsResponse>(res);
}

// ==========================================
// GAME STATS BATCH (público — ADR-015, compliance)
// ==========================================

export interface GameStat {
    totalTickets:  number;
    totalWagered:  number;
    totalPaidOut:  number;
    rtpPct:        number;
}

/**
 * Retorna estatísticas de compliance (total tickets, wagered, paid out) para
 * uma lista de game_ids. Público, best-effort (só jogos sincronizados no ledger).
 */
export async function fetchBatchGameStats(
    gameIds: string[],
): Promise<Record<string, GameStat>> {
    if (gameIds.length === 0) return {};
    try {
        const params = new URLSearchParams({ gameIds: gameIds.join(',') });
        const res = await fetch(`${API_BASE}/statistics/games/batch?${params}`);
        if (!res.ok) return {};
        const data = await res.json() as { stats: Record<string, GameStat> };
        return data.stats ?? {};
    } catch {
        return {};
    }
}

// ==========================================
// ROOMS (ADR-010)
// ==========================================

export interface RoomDropConfig {
    token_contract?:    string;
    symbol?:            string;
    amount?:            string;
    template_id?:       number;
    collection_name?:   string;
    drop_chance_pct:    number;
    max_drops_per_game: number;
}

export interface RoomMetadata {
    room_id:             string;
    name:                string;
    description:         string;
    cover_image_url:     string;
    rules_summary:       string;
    chat_enabled:        boolean;
    auto_start_delay_sec: number;
    drops:               RoomDropConfig[];
}

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
}

export interface EnrichedRoom extends BlockchainRoom {
    metadata: RoomMetadata | null;
}

export async function fetchRooms(): Promise<{ rooms: EnrichedRoom[] }> {
    const res = await fetch(`${API_BASE}/rooms`);
    return handleResponse(res);
}

export async function fetchRoom(roomId: string): Promise<EnrichedRoom> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}`);
    return handleResponse(res);
}

export async function createAdminRoom(data: {
    room_id: number;
    sponsor?: string;
    gametype_id?: number;
    currency_quantity: string;
    currency_contract: string;
    ticket_price_min_quantity?: string;
    ticket_price_min_contract?: string;
    ticket_price_max_quantity?: string;
    ticket_price_max_contract?: string;
    ticket_price_default_quantity?: string;
    ticket_price_default_contract?: string;
    weight?: number;
    max_tickets_per_player?: number;
    nft_template_allowlist?: number[];
    name?: string;
    description?: string;
    cover_image_url?: string;
    rules_summary?: string;
    chat_enabled?: boolean;
    auto_start_delay_sec?: number;
    drops?: RoomDropConfig[];
}): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/rooms`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function updateRoomMetadata(roomId: string, data: Partial<RoomMetadata>): Promise<RoomMetadata> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/metadata`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function updateRoomSettings(roomId: string, data: {
    room_drop_chance_bps?: number;
    max_tickets_per_player?: number;
}): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/settings`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function activateRoom(roomId: string): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/activate`, {
        method: 'POST', headers: authHeaders(),
    });
    return handleResponse(res);
}

export async function pauseRoom(roomId: string): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/pause`, {
        method: 'POST', headers: authHeaders(),
    });
    return handleResponse(res);
}

export async function closeRoom(roomId: string): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/close`, {
        method: 'POST', headers: authHeaders(),
    });
    return handleResponse(res);
}

export async function fetchSponsorRooms(): Promise<{ rooms: EnrichedRoom[] }> {
    const res = await fetch(`${API_BASE}/sponsor/rooms`, { headers: authHeaders() });
    return handleResponse(res);
}

// ==========================================
// DROP VAULT (ADR-011)
// ==========================================

export interface DropDeposit {
    deposit_id: string;
    owner: string;
    asset_type: 'token' | 'nft';
    token_contract: string;
    token_symbol: string;
    quantity_original: { quantity: string; contract: string };
    quantity_remaining: { quantity: string; contract: string };
    nft_asset_id: string;
    nft_template_id: number;
    nft_collection: string;
    status: string;
    deposited_at: number;
}

export interface DropAllocation {
    alloc_id: string;
    deposit_id: string;
    owner: string;
    room_id: string;
    asset_type: 'token' | 'nft';
    token_contract: string;
    token_symbol: string;
    quantity_per_drop: { quantity: string; contract: string };
    quantity_distributed: { quantity: string; contract: string };
    nft_asset_id: string;
    nft_template_id: number;
    nft_collection: string;
    drop_chance_bps: number;
    drops_executed: number;
    status: string;
    allocated_at: number;
}

export async function fetchVaultDeposits(): Promise<{ deposits: DropDeposit[] }> {
    const res = await fetch(`${API_BASE}/vault/deposits`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function fetchVaultDeposit(depositId: string): Promise<DropDeposit> {
    const res = await fetch(`${API_BASE}/vault/deposits/${depositId}`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function fetchVaultAllocations(roomId?: string): Promise<{ allocations: DropAllocation[] }> {
    const params = roomId ? `?roomId=${roomId}` : '';
    const res = await fetch(`${API_BASE}/vault/allocations${params}`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function allocateDropToRoom(data: {
    deposit_id: string;
    room_id: string;
    quantity_per_drop?: string;
    nft_asset_id?: string;
    drop_chance_bps: number;
}): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/vault/allocate`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function deallocateFromRoom(allocId: string): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/vault/deallocate`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ alloc_id: allocId }),
    });
    return handleResponse(res);
}

export async function reclaimVaultDeposit(depositId: string): Promise<{ transaction_id: string }> {
    const res = await fetch(`${API_BASE}/vault/reclaim`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ deposit_id: depositId }),
    });
    return handleResponse(res);
}

// ==========================================
// LEADERBOARD — Rankings públicos (ADR-024)
// ==========================================

export interface LeaderboardResponse {
    entries:        import('@cryptobingo/shared-types').LeaderboardEntry[];
    cached_at:      string;
    currency_filter: string | null;
}

export interface RoomLeaderboardResponse {
    room_id:   string;
    entries:   import('@cryptobingo/shared-types').LeaderboardEntry[];
    cached_at: string;
}

export interface LeaderboardXpResponse {
    entries:   import('@cryptobingo/shared-types').LeaderboardXpEntry[];
    cached_at: string;
}

export async function fetchLeaderboard(opts?: { currency?: string; limit?: number }): Promise<LeaderboardResponse> {
    const params = new URLSearchParams();
    if (opts?.currency) params.set('currency', opts.currency);
    if (opts?.limit)    params.set('limit',    String(opts.limit));
    const res = await fetch(`${API_BASE}/leaderboard?${params}`, { headers: publicHeaders() });
    return handleResponse(res);
}

export async function fetchLeaderboardXp(limit = 20): Promise<LeaderboardXpResponse> {
    const res = await fetch(`${API_BASE}/leaderboard/xp?limit=${limit}`, { headers: publicHeaders() });
    return handleResponse<LeaderboardXpResponse>(res);
}

export async function fetchRoomLeaderboard(roomId: string, limit = 10): Promise<RoomLeaderboardResponse> {
    const res = await fetch(`${API_BASE}/leaderboard/rooms/${encodeURIComponent(roomId)}?limit=${limit}`, {
        headers: publicHeaders(),
    });
    return handleResponse(res);
}

// ==========================================
// NEWS — Publicações públicas (ADR-024)
// ==========================================

export interface NewsListResponse {
    items:     import('@cryptobingo/shared-types').NewsItem[];
    total:     number;
    cached_at: string;
}

export async function fetchNews(opts?: { limit?: number; offset?: number }): Promise<NewsListResponse> {
    const params = new URLSearchParams();
    if (opts?.limit)  params.set('limit',  String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    const res = await fetch(`${API_BASE}/news?${params}`, { headers: publicHeaders() });
    return handleResponse(res);
}

export async function createNewsItem(data: {
    title: string; content: string; image_url?: string | null;
    locale_overrides?: object; active?: boolean; pinned?: boolean;
}): Promise<import('@cryptobingo/shared-types').NewsItem> {
    const res = await fetch(`${API_BASE}/news`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function updateNewsItem(id: string, data: {
    title?: string; content?: string; image_url?: string | null;
    locale_overrides?: object; active?: boolean; pinned?: boolean;
}): Promise<import('@cryptobingo/shared-types').NewsItem> {
    const res = await fetch(`${API_BASE}/news/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function deleteNewsItem(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/news/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: authHeaders(),
    });
    return handleResponse(res);
}

// ==========================================
// SYNC BURNS (ADR-028 §8)
// ==========================================

export interface SyncBurnsResponse {
    recorded:  number;
    asset_ids: string[];
}

export async function syncBurns(): Promise<SyncBurnsResponse> {
    const res = await fetch(`${API_BASE}/nfts/sync-burns`, {
        method: 'POST', headers: authHeaders(),
    });
    return handleResponse<SyncBurnsResponse>(res);
}

// ==========================================
// PROFILE UPDATE (WAX-signed)
// ==========================================

export interface UpdateProfilePayload {
    nickname?:            string;
    locale?:              string;
    avatar_nft_asset_id?: string | null;
    signature?:           string;
    ts?:                  number;
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<void> {
    const res = await fetch(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return handleResponse(res);
}

// ==========================================
// SYSTEM TOKENS (config pública)
// ==========================================

export interface SystemToken {
    _id:       string;
    contract:  string;
    symbol:    string;
    precision: number;
    label:     string;
    is_native: boolean;
    enabled:   boolean;
}

export async function fetchSupportedTokens(): Promise<{ tokens: SystemToken[] }> {
    const res = await fetch(`${API_BASE}/config/tokens`);
    return handleResponse<{ tokens: SystemToken[] }>(res);
}

export async function createSupportedToken(
    data: Omit<SystemToken, '_id' | 'enabled'>,
): Promise<{ token: SystemToken }> {
    const res = await fetch(`${API_BASE}/admin/config/tokens`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    });
    return handleResponse<{ token: SystemToken }>(res);
}

export async function deleteSupportedToken(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/config/tokens/${id}`, {
        method: 'DELETE', headers: authHeaders(),
    });
    return handleResponse(res);
}
