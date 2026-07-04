// apps/api-gateway/src/database/ledger.ts
// Schema e operações do PostgreSQL Ledger de Compliance.
// Ref: COMPLIANCE.md §2, architecture.md §6.1, Lei 14.790/2023

import { pgPool } from './index';

// ==========================================
// SCHEMA (idempotente — CREATE IF NOT EXISTS)
// ==========================================

export async function ensureLedgerTables(): Promise<void> {
    await pgPool.query(`
        -- Histórico de jogos (espelho do on-chain para auditoria)
        CREATE TABLE IF NOT EXISTS games_history (
            game_id         VARCHAR(32)    NOT NULL PRIMARY KEY,
            status          VARCHAR(16)    NOT NULL,
            gametype_id     VARCHAR(32)    NOT NULL DEFAULT '0',
            campaign_id     VARCHAR(32)    NOT NULL DEFAULT '0',
            ticket_price    NUMERIC(18,4)  NOT NULL DEFAULT 0,
            ticket_symbol   VARCHAR(12)    NOT NULL DEFAULT 'WAX',
            total_tickets   INTEGER        NOT NULL DEFAULT 0,
            total_wagered   NUMERIC(18,4)  NOT NULL DEFAULT 0,
            total_paid_out  NUMERIC(18,4)  NOT NULL DEFAULT 0,
            ggr             NUMERIC(18,4)  NOT NULL DEFAULT 0,
            rtp_pct         NUMERIC(6,4)   NOT NULL DEFAULT 0,
            resolved_at     TIMESTAMPTZ,
            created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
        );

        -- Ledger transacional (cada ação financeira)
        CREATE TABLE IF NOT EXISTS transactions_ledger (
            id              UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            tx_hash         VARCHAR(128)   NOT NULL,
            wallet_address  VARCHAR(64)    NOT NULL,
            game_id         VARCHAR(32),
            action_type     VARCHAR(24)    NOT NULL,
            amount          NUMERIC(18,4)  NOT NULL,
            currency        VARCHAR(12)    NOT NULL,
            memo            TEXT,
            block_time      TIMESTAMPTZ    NOT NULL,
            created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_txledger_wallet    ON transactions_ledger (wallet_address);
        CREATE INDEX IF NOT EXISTS idx_txledger_game      ON transactions_ledger (game_id);
        CREATE INDEX IF NOT EXISTS idx_txledger_action    ON transactions_ledger (action_type);
        CREATE INDEX IF NOT EXISTS idx_txledger_blocktime ON transactions_ledger (block_time DESC);
        CREATE INDEX IF NOT EXISTS idx_games_history_status ON games_history (status);
        CREATE INDEX IF NOT EXISTS idx_games_history_created ON games_history (created_at DESC);
    `);

    console.log('✅ [Ledger] Tabelas games_history e transactions_ledger verificadas.');
}

// ==========================================
// OPERAÇÕES DO LEDGER
// ==========================================

export interface LedgerEntry {
    tx_hash:       string;
    wallet_address: string;
    game_id?:      string;
    action_type:   'deposit' | 'withdraw' | 'buy_ticket' | 'claim_win' | 'refund' | 'campaign_deposit';
    amount:        number;
    currency:      string;
    memo?:         string;
    block_time:    Date;
}

/**
 * Registra uma transação financeira no ledger.
 * Chamada pelo indexador ou diretamente pelos controllers quando disponível.
 */
export async function recordTransaction(entry: LedgerEntry): Promise<void> {
    await pgPool.query(
        `INSERT INTO transactions_ledger
            (tx_hash, wallet_address, game_id, action_type, amount, currency, memo, block_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
            entry.tx_hash,
            entry.wallet_address,
            entry.game_id ?? null,
            entry.action_type,
            entry.amount,
            entry.currency,
            entry.memo ?? null,
            entry.block_time,
        ]
    );
}

/**
 * Registra ou atualiza um jogo no histórico de compliance.
 * Upsert idempotente — pode ser chamado múltiplas vezes conforme o jogo evolui.
 */
export async function upsertGameHistory(data: {
    game_id:       string;
    status:        string;
    gametype_id:   string;
    campaign_id:   string;
    ticket_price:  number;
    ticket_symbol: string;
    total_tickets: number;
    total_wagered: number;
    total_paid_out: number;
    resolved_at?:  Date;
}): Promise<void> {
    const ggr     = data.total_wagered - data.total_paid_out;
    const rtp_pct = data.total_wagered > 0
        ? (data.total_paid_out / data.total_wagered)
        : 0;

    await pgPool.query(
        `INSERT INTO games_history
            (game_id, status, gametype_id, campaign_id, ticket_price, ticket_symbol,
             total_tickets, total_wagered, total_paid_out, ggr, rtp_pct, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (game_id) DO UPDATE SET
            status         = EXCLUDED.status,
            total_tickets  = EXCLUDED.total_tickets,
            total_wagered  = EXCLUDED.total_wagered,
            total_paid_out = EXCLUDED.total_paid_out,
            ggr            = EXCLUDED.ggr,
            rtp_pct        = EXCLUDED.rtp_pct,
            resolved_at    = EXCLUDED.resolved_at`,
        [
            data.game_id, data.status, data.gametype_id, data.campaign_id,
            data.ticket_price, data.ticket_symbol,
            data.total_tickets, data.total_wagered, data.total_paid_out,
            ggr, rtp_pct, data.resolved_at ?? null,
        ]
    );
}

// ==========================================
// QUERIES ANALÍTICAS (para /statistics/rtp)
// ==========================================

export interface RtpReport {
    period:           string;
    total_games:      number;
    total_wagered:    number;
    total_paid_out:   number;
    total_ggr:        number;
    avg_rtp_pct:      number;
    avg_rtp_display:  string;
    avg_ggr_display:  string;
    currency:         string;
    generated_at:     string;
}

export interface RecentGame {
    game_id:       string;
    status:        string;
    total_wagered: number;
    total_paid_out: number;
    rtp_pct:       number;
    resolved_at:   Date | null;
}

/**
 * Calcula o relatório de RTP/GGR para um período.
 * Ref: COMPLIANCE.md §2.2, Lei 14.790/2023
 */
export async function getRtpReport(
    periodDays: number = 30,
    currency:   string = 'WAX',
): Promise<RtpReport> {
    const result = await pgPool.query(
        `SELECT
            COUNT(*)::int                          AS total_games,
            COALESCE(SUM(total_wagered), 0)        AS total_wagered,
            COALESCE(SUM(total_paid_out), 0)       AS total_paid_out,
            COALESCE(SUM(ggr), 0)                  AS total_ggr,
            COALESCE(AVG(rtp_pct) * 100, 0)        AS avg_rtp_pct
         FROM games_history
         WHERE ticket_symbol = $1
           AND status IN ('archived', 'aborted')
           AND created_at >= NOW() - INTERVAL '1 day' * $2`,
        [currency, periodDays]
    );

    const row = result.rows[0];
    const avgRtp = parseFloat(row.avg_rtp_pct) || 0;
    const avgGgr = 100 - avgRtp;

    return {
        period:          `${periodDays} dias`,
        total_games:     row.total_games,
        total_wagered:   parseFloat(row.total_wagered),
        total_paid_out:  parseFloat(row.total_paid_out),
        total_ggr:       parseFloat(row.total_ggr),
        avg_rtp_pct:     avgRtp,
        avg_rtp_display: `${avgRtp.toFixed(2)}%`,
        avg_ggr_display: `${avgGgr.toFixed(2)}%`,
        currency,
        generated_at:    new Date().toISOString(),
    };
}

/**
 * Retorna os jogos mais recentes para o painel de auditoria.
 */
export async function getRecentGames(limit: number = 20): Promise<RecentGame[]> {
    const result = await pgPool.query(
        `SELECT game_id, status, total_wagered, total_paid_out, rtp_pct * 100 AS rtp_pct, resolved_at
         FROM games_history
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
    );
    return result.rows;
}

// ==========================================
// BATCH STATS (para histórico público de jogos)
// ==========================================

export interface GameStatsBatch {
    game_id:       string;
    total_tickets: number;
    total_wagered: number;
    total_paid_out: number;
    rtp_pct:       number;
}

// ==========================================
// PLATFORM SUMMARY (para landing page e dashboards)
// ==========================================

export interface PlatformSummary {
    total_games:   number;
    total_prizes:  number;
    total_players: number;
    avg_rtp_pct:   number;
    currency:      string;
    generated_at:  string;
}

/**
 * Resumo agregado da plataforma — queries games_history + transactions_ledger.
 * Usado pela landing page (StatsBar) e dashboards públicos.
 */
export async function getPlatformSummary(): Promise<PlatformSummary> {
    const [gamesRes, playersRes] = await Promise.all([
        pgPool.query(
            `SELECT
                COUNT(*)::int                     AS total_games,
                COALESCE(SUM(total_paid_out), 0)  AS total_prizes,
                COALESCE(AVG(rtp_pct) * 100, 0)   AS avg_rtp_pct
             FROM games_history
             WHERE status IN ('archived', 'aborted')`
        ),
        pgPool.query(
            `SELECT COUNT(DISTINCT wallet_address)::int AS total_players
             FROM transactions_ledger`
        ),
    ]);

    const g = gamesRes.rows[0];
    const p = playersRes.rows[0];

    return {
        total_games:   Number(g.total_games),
        total_prizes:  Math.round(parseFloat(g.total_prizes)),
        total_players: Number(p.total_players),
        avg_rtp_pct:   Math.round(parseFloat(g.avg_rtp_pct) * 100) / 100,
        currency:      'WAX',
        generated_at:  new Date().toISOString(),
    };
}

/**
 * Retorna estatísticas de compliance para uma lista de game_ids.
 * Best-effort: retorna apenas jogos que foram sincronizados no ledger.
 * Ref: ADR-015, Lei 14.790/2023 (transparência pública)
 */
export async function getGameStatsBatch(gameIds: string[]): Promise<GameStatsBatch[]> {
    if (gameIds.length === 0) return [];
    const result = await pgPool.query(
        `SELECT game_id, total_tickets, total_wagered, total_paid_out, rtp_pct * 100 AS rtp_pct
         FROM games_history
         WHERE game_id = ANY($1::varchar[])`,
        [gameIds]
    );
    return result.rows.map(r => ({
        game_id:        r.game_id,
        total_tickets:  Number(r.total_tickets),
        total_wagered:  parseFloat(r.total_wagered),
        total_paid_out: parseFloat(r.total_paid_out),
        rtp_pct:        parseFloat(r.rtp_pct),
    }));
}
