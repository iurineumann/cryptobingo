// apps/api-gateway/src/index.ts
// Hardening de produção: Helmet, CORS restrito, rate limiting por rota, RBAC.

import express                                       from 'express';
import cors, { CorsOptions }                         from 'cors';
import helmet                                        from 'helmet';
import dotenv                                        from 'dotenv';
import { connectMongo, connectPostgres }             from './database';
import { connectRedis }                              from './database/redis';
import { requireAuth }                               from './middleware/auth';
import { requireRole }                               from './middleware/rbac';
import {
    authLimiter,
    playerLimiter,
    ticketLimiter,
    adminLimiter,
    monteCarloLimiter,
    initRateLimiters,
} from './middleware/rateLimiter';
import {
    requestChallenge,
    verifyChallenge,
    ensureNonceTable,
    logout,
} from './controllers/authController';
import { getProfile, updatePreferences, listUsers }   from './controllers/profileController';
import { generateTickets }                           from './controllers/ticketController';
import {
    listPatterns, upsertPattern, deletePattern,
    listGametypes, upsertGametype, deleteGametype,
    getGametypeMetadata, upsertGametypeMetadata, getGametypeMetadataPublic,
} from './controllers/patternController';
import { simulateWeights, calibrateWeights }         from './controllers/monteCarloController';
import { getRtpStatistics, getGamesHistory, syncGameToLedger, getGameStatsBatchHandler } from './controllers/statisticsController';
import { ensureLedgerTables }                         from './database/ledger';
import {
    listCampaigns, getCampaign,
    linkCampaignToGame, closeCampaign,
}                                                    from './controllers/sponsorController';
import { getMyNfts }                                 from './controllers/nftController';
import { getPlayerWinnings, getPlayerWinningsBatch }  from './controllers/winningsController';
import {
    listRooms, getRoom, createRoom, upsertRoomMetadata,
    updateRoomSettings, activateRoom, pauseRoom, closeRoom,
    listSponsorRooms,
}                                                    from './controllers/roomController';
import {
    listDeposits, getDeposit,
    listAllocations,
    allocateDrop, deallocateDrop, reclaimAsset,
}                                                    from './controllers/dropController';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 8080;

// ==========================================
// CORS — Lista branca de origins
// ==========================================

const ALLOWED_ORIGINS: string[] = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        // Permite requests sem origin (ex: curl, Postman, mobile apps)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin não autorizada: ${origin}`));
    },
    methods:          ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders:   ['Content-Type', 'Authorization'],
    exposedHeaders:   ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    credentials:      true,
    maxAge:           86400, // Preflight cache por 24h
};

// ==========================================
// BOOTSTRAP
// ==========================================

async function bootstrap(): Promise<void> {
    await connectMongo();
    await connectPostgres();
    await connectRedis();
    await ensureNonceTable();
    console.log('✅ [Bootstrap] Tabela auth_nonces verificada.');

    // Inicializa rate limiters APÓS o Redis conectar
    initRateLimiters();

    // Garante tabelas de compliance no PostgreSQL
    await ensureLedgerTables();

    registerMiddleware();
    registerRoutes();

    app.listen(PORT, () => {
        console.log('=============================================');
        console.log(`🌐 CryptoBingo: API Gateway na porta ${PORT}`);
        console.log(`   Origins permitidas: ${ALLOWED_ORIGINS.join(', ')}`);
        console.log(`   Helmet: ativo`);
        console.log(`   RBAC:   ativo`);
        console.log(`   JWT Blacklist: ativo (Redis)`);
        console.log('=============================================');
    });
}

// ==========================================
// MIDDLEWARE GLOBAL
// ==========================================

function registerMiddleware(): void {
    // Helmet — headers de segurança HTTP
    // crossOriginResourcePolicy desabilitado para compatibilidade com Wharfkit (CDN de scripts)
    app.use(helmet({
        crossOriginResourcePolicy:   { policy: 'cross-origin' },
        contentSecurityPolicy:       false, // Gerenciado pelo frontend (Vite)
        crossOriginEmbedderPolicy:   false, // Necessário para SharedArrayBuffer do Wharfkit
    }));

    // CORS restrito
    app.use(cors(corsOptions));
    app.options('*', cors(corsOptions)); // Preflight

    // Body parser
    app.use(express.json({ limit: '1mb' })); // Limite explícito — previne body too large attacks

    // Header de segurança adicional (não coberto pelo Helmet)
    app.use((_req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        next();
    });
}

// ==========================================
// ROTAS
// ==========================================

function registerRoutes(): void {

    // ── Health (sem rate limit — monitoramento) ───────────────────────────────
    app.get('/api/v1/health', (_req, res) => {
        res.status(200).json({ status: 'Gateway Online', timestamp: new Date() });
    });

    // ── Autenticação pública (rate limit restrito — anti brute-force) ─────────
    app.post('/api/v1/auth/challenge', authLimiter, requestChallenge);
    app.post('/api/v1/auth/verify',    authLimiter, verifyChallenge);

    // ── Logout (JWT) — revoga o token atual na blacklist Redis ────────────────
    app.post('/api/v1/auth/logout', requireAuth, logout);

    // ── Perfil (JWT + player rate limit) ─────────────────────────────────────
    app.get('/api/v1/profile', playerLimiter, requireAuth, getProfile);
    app.put('/api/v1/profile', playerLimiter, requireAuth, updatePreferences);

    // ── Cartelas (JWT + ticket rate limit) ───────────────────────────────────
    app.post(
        '/api/v1/games/:gameId/tickets/generate',
        ticketLimiter,
        requireAuth,
        generateTickets
    );

    // ── Admin: Patterns (JWT + RBAC admin + admin rate limit) ─────────────────
    app.get(
        '/api/v1/admin/patterns',
        adminLimiter, requireAuth, requireRole('admin'), listPatterns
    );
    app.post(
        '/api/v1/admin/patterns',
        adminLimiter, requireAuth, requireRole('admin'), upsertPattern
    );
    app.delete(
        '/api/v1/admin/patterns/:patternId',
        adminLimiter, requireAuth, requireRole('admin'), deletePattern
    );

    // ── Admin: Gametypes (JWT + RBAC admin + admin rate limit) ────────────────
    app.get(
        '/api/v1/admin/gametypes',
        adminLimiter, requireAuth, requireRole('admin'), listGametypes
    );
    app.post(
        '/api/v1/admin/gametypes',
        adminLimiter, requireAuth, requireRole('admin'), upsertGametype
    );
    app.delete(
        '/api/v1/admin/gametypes/:gametypeId',
        adminLimiter, requireAuth, requireRole('admin'), deleteGametype
    );
    app.get(
        '/api/v1/gametypes/:gametypeId/metadata',
        playerLimiter, getGametypeMetadataPublic
    );
    app.get(
        '/api/v1/admin/gametypes/:gametypeId/metadata',
        adminLimiter, requireAuth, requireRole('admin'), getGametypeMetadata
    );
    app.put(
        '/api/v1/admin/gametypes/:gametypeId/metadata',
        adminLimiter, requireAuth, requireRole('admin'), upsertGametypeMetadata
    );

    // ── Rooms (ADR-010) ──────────────────────────────────────────────
    app.get('/api/v1/rooms',                               playerLimiter, listRooms);
    app.get('/api/v1/rooms/:roomId',                       playerLimiter, getRoom);
    app.post('/api/v1/rooms',                        adminLimiter, requireAuth, requireRole('admin'), createRoom);
    app.put('/api/v1/rooms/:roomId/metadata',        adminLimiter, requireAuth, requireRole('admin'), upsertRoomMetadata);
    app.put('/api/v1/rooms/:roomId/settings',        adminLimiter, requireAuth, requireRole('admin'), updateRoomSettings);
    app.post('/api/v1/rooms/:roomId/activate',       adminLimiter, requireAuth, requireRole('admin'), activateRoom);
    app.post('/api/v1/rooms/:roomId/pause',          adminLimiter, requireAuth, requireRole('admin'), pauseRoom);
    app.post('/api/v1/rooms/:roomId/close',          adminLimiter, requireAuth, requireRole('admin'), closeRoom);
    app.get('/api/v1/sponsor/rooms',                       playerLimiter, requireAuth, requireRole('sponsor'), listSponsorRooms);

    // ── Admin: Monte Carlo ─────────────────────────────────────────────────
    app.post(
        '/api/v1/admin/simulate-weights',
        monteCarloLimiter, requireAuth, requireRole('admin'), simulateWeights
    );
    app.post(
        '/api/v1/admin/calibrate-weights',
        monteCarloLimiter, requireAuth, requireRole('admin'), calibrateWeights
    );

    // ── Statistics / Compliance (públicas) — Lei 14.790/2023 ─────────────────
    app.get('/api/v1/statistics/rtp',          getRtpStatistics);
    app.get('/api/v1/statistics/games',        getGamesHistory);
    app.get('/api/v1/statistics/games/batch',  getGameStatsBatchHandler);

    // ── Admin: Ledger sync (JWT + admin) ──────────────────────────────────────
    app.post('/api/v1/admin/ledger/sync', adminLimiter, requireAuth, requireRole('admin'), syncGameToLedger);

    // ── Admin: Users (JWT + admin) ────────────────────────────────────────────
    app.get('/api/v1/admin/users', adminLimiter, requireAuth, requireRole('admin'), listUsers);

    // ── Sponsors B2B (SPEC.md §1.4, brief.md §1) ─────────────────────────────
    app.get ('/api/v1/sponsors/campaigns',                         playerLimiter, listCampaigns);
    app.get ('/api/v1/sponsors/campaigns/:campaignId',             playerLimiter, getCampaign);
    app.post('/api/v1/sponsors/campaigns/:campaignId/link',  adminLimiter, requireAuth, requireRole('admin'), linkCampaignToGame);
    app.post('/api/v1/sponsors/campaigns/:campaignId/close', adminLimiter, requireAuth, requireRole('admin'), closeCampaign);

    // ── NFTs (JWT) ───────────────────────────────────────────────────────
    app.get('/api/v1/nfts/my-assets', playerLimiter, requireAuth, getMyNfts);

    // ── Winnings (JWT) ───────────────────────────────────────────────────
    app.get('/api/v1/player/winnings/:gameId', playerLimiter, requireAuth, getPlayerWinnings);
    app.post('/api/v1/player/winnings/batch', playerLimiter, requireAuth, getPlayerWinningsBatch);

    // ── Drop Vault (ADR-011) ──────────────────────────────────────────────
    app.get('/api/v1/vault/deposits',         playerLimiter, requireAuth, listDeposits);
    app.get('/api/v1/vault/deposits/:depositId', playerLimiter, requireAuth, getDeposit);
    app.get('/api/v1/vault/allocations',      playerLimiter, requireAuth, listAllocations);
    app.post('/api/v1/vault/allocate',   adminLimiter, requireAuth, requireRole('admin'), allocateDrop);
    app.post('/api/v1/vault/deallocate', adminLimiter, requireAuth, requireRole('admin'), deallocateDrop);
    app.post('/api/v1/vault/reclaim',    playerLimiter, requireAuth, reclaimAsset);

    // ── 404 catch-all ─────────────────────────────────────────────────────────
    app.use((_req, res) => {
        res.status(404).json({ error: 'Rota não encontrada.' });
    });

    // ── Error handler global ──────────────────────────────────────────────────
    // Captura erros do CORS e demais middlewares sem vazar stack traces
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        if (err.message.startsWith('CORS:')) {
            res.status(403).json({ error: err.message });
            return;
        }
        console.error('[Gateway] Erro não tratado:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    });
}

// ==========================================
// ENTRYPOINT
// ==========================================

bootstrap().catch((error) => {
    console.error('❌ [Bootstrap] Falha crítica na inicialização:', error);
    process.exit(1);
});
