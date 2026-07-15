import { rpcClient } from '@cryptobingo/blockchain-core';
import { Name, UInt64 } from '@wharfkit/antelope';
import { Pool } from 'pg';
import { redisClient } from './redis';
import type { BlockchainGameState } from '@cryptobingo/shared-types';
import { logger } from './logger';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';
const INDEXER_INTERVAL_MS = parseInt(process.env.INDEXER_INTERVAL_MS ?? '15000', 10);
const REDIS_CURSOR_KEY = 'indexer:last_game_name';

const pgPool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});

async function ensureTables(): Promise<void> {
    await pgPool.query(`
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
            rtp_pct         NUMERIC(18,4)  NOT NULL DEFAULT 0,
            resolved_at     TIMESTAMPTZ,
            created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
        );

        -- Corrige schema legado: rtp_pct era NUMERIC(6,4) e estourava quando
        -- totalPaidOut/totalWagered era grande (RTP > 100% com jackpot/sponsor).
        -- Idempotente: ALTER para o mesmo tipo é no-op em tabelas já corrigidas.
        ALTER TABLE games_history ALTER COLUMN rtp_pct TYPE NUMERIC(18,4);

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
        CREATE INDEX IF NOT EXISTS idx_games_history_status ON games_history (status);
    `);
}

async function getLastCursor(): Promise<string | undefined> {
    try {
        const val = await redisClient.get(REDIS_CURSOR_KEY);
        return val ?? undefined;
    } catch {
        return undefined;
    }
}

async function saveCursor(gameId: string): Promise<void> {
    try {
        await redisClient.set(REDIS_CURSOR_KEY, gameId);
    } catch { }
}

export async function indexGames(): Promise<void> {
    const lastCursor = await getLastCursor();

    const response = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: CONTRACT_ACCOUNT,
        table: 'games',
        limit: 20,
        lower_bound: lastCursor ? UInt64.from(lastCursor) : undefined,
        json: true,
    });

    const games = response.rows as BlockchainGameState[];
    if (!games.length) return;

    for (const game of games) {
        const ticketPrice = game.ticket_price;
        const ticketSymbol = ticketPrice.quantity.split(' ')[1] ?? 'WAX';
        const ticketPriceNum = parseFloat(ticketPrice.quantity) || 0;
        const totalWagered = parseFloat(game.total_wagered?.quantity ?? '0') || 0;
        const totalPaidOut = Math.abs(game.total_paid ?? 0);

        let totalTickets = 0;
        if (['locked', 'drawing', 'drawn', 'archived', 'aborted'].includes(game.status)) {
            try {
                const ticketRes = await rpcClient.v1.chain.get_table_rows({
                    code: CONTRACT_ACCOUNT,
                    scope: Name.from(UInt64.from(String(game.game_id))),
                    table: 'tickets',
                    limit: 1000,
                    json: true,
                    reverse: false,
                });
                // Contagem real de tickets emitidos no jogo. NUNCA usar ticket_id
                // (uint64 ~2.45e17) como contagem: estoura INTEGER (int32) no INSERT
                // e é semanticamente errado. Capado em 1000 p/ jogos muito grandes.
                totalTickets = ticketRes.rows.length;
            } catch { }
        }

        const resolvedAt = ['archived', 'aborted'].includes(game.status)
            ? game.end_time
                ? new Date(game.end_time + 'Z')
                : null
            : null;

        const ggr = totalWagered - totalPaidOut;
        // RTP real (fração). Jogos com prêmio >> aposta (jackpot/sponsor) podem
        // passar de 100%; totalWagered muito pequeno gera valor absurdo -> NaN/Infinity.
        // Guard finito; a coluna rtp_pct é NUMERIC(18,4) (suporta RTP alto).
        const rawRtp = totalWagered > 0 ? totalPaidOut / totalWagered : 0;
        const rtpPct = Number.isFinite(rawRtp) ? rawRtp : 0;

        await pgPool.query(
            `INSERT INTO games_history
                (game_id, status, gametype_id, campaign_id,
                 ticket_price, ticket_symbol,
                 total_tickets, total_wagered, total_paid_out,
                 ggr, rtp_pct, resolved_at)
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
                game.game_id, game.status, game.gametype_id ?? '0', game.campaign_id ?? '0',
                ticketPriceNum, ticketSymbol,
                totalTickets, totalWagered, totalPaidOut,
                ggr, rtpPct, resolvedAt,
            ]
        );
    }

    const lastGame = games[games.length - 1];
    await saveCursor(lastGame.game_id);

    logger.info(
        `[Indexer] ${games.length} jogo(s) indexado(s) (até ${lastGame.game_id})`
    );
}

let running = false;

export async function startBlockchainIndexer(): Promise<void> {
    await ensureTables();
    logger.info({ tag: 'Indexer' }, `Iniciado (intervalo: ${INDEXER_INTERVAL_MS}ms)`)

    const poll = async () => {
        if (running) return;
        running = true;
        try {
            await indexGames();
        } catch (err) {
            logger.error({ err, tag: 'Indexer' }, 'Erro na indexação:')
        } finally {
            running = false;
        }
    };

    await poll();
    setInterval(poll, INDEXER_INTERVAL_MS);
}
