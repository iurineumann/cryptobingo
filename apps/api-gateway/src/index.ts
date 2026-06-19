// apps/api-gateway/src/index.ts
// Hardening de produção: Helmet, CORS restrito, rate limiting por rota, RBAC.

import { createServer }                              from 'http';
import { Server as SocketIoServer }                  from 'socket.io';
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
import { getProfile, updatePreferences, getAchievements, listUsers } from './controllers/profileController';
import { generateTickets }                           from './controllers/ticketController';
import {
    listPatterns, upsertPattern, deletePattern,
    listGametypes, upsertGametype, updateGametype, deleteGametype,
    saveStages,
    getGametypeMetadata, upsertGametypeMetadata, getGametypeMetadataPublic,
    getGametypePatternsPublic,
} from './controllers/patternController';
import { simulateWeights, calibrateWeights, suggestCombos } from './controllers/monteCarloController';
import { getRtpStatistics, getGamesHistory, syncGameToLedger, getGameStatsBatchHandler } from './controllers/statisticsController';
import { ensureLedgerTables }                         from './database/ledger';
import {
    listCampaigns, getCampaign,
    linkCampaignToGame, closeCampaign,
}                                                    from './controllers/sponsorController';
import { getMyNfts, getEligibleDiscountNfts, syncBurns } from './controllers/nftController';
import { listTokens, createToken, deleteToken }          from './controllers/tokenConfigController';
import { livenessCheck, readinessCheck }             from './controllers/healthController';
import { getPlayerWinnings, getPlayerWinningsBatch }  from './controllers/winningsController';
import {
    listRooms, getRoom, createRoom, upsertRoomMetadata,
    updateRoomSettings, activateRoom, pauseRoom, closeRoom,
    listSponsorRooms, setRoomNft, getRoomTreasury,
}                                                    from './controllers/roomController';
import {
    listDeposits, getDeposit,
    listAllocations,
    allocateDrop, deallocateDrop, reclaimAsset,
}                                                    from './controllers/dropController';
import { listSwapPools, getSwapQuote }               from './controllers/swapController';
import { getChatHistory, saveChatMessage } from './controllers/chatController';
import { createSystemChatMessage, requireInternalAuth } from './controllers/internalChatController';
import { startMetricsServer, metricsMiddleware } from './services/metrics';
import { setupChatSocket }                            from './socket/chatSocket';
import { setIo }                                     from './socket';
import { getLeaderboardGlobal, getLeaderboardByRoom, getLeaderboardXp } from './controllers/leaderboardController';
import { listNews, createNews, updateNews, deleteNews } from './controllers/newsController';

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
    startMetricsServer();
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

    const httpServer = createServer(app);
    const io = new SocketIoServer(httpServer, {
        cors: { origin: ALLOWED_ORIGINS, credentials: true },
    });
    setIo(io);
    setupChatSocket(io);

    httpServer.listen(PORT, () => {
        console.log('=============================================');
        console.log(`🌐 CryptoBingo: API Gateway na porta ${PORT}`);
        console.log(`   Origins permitidas: ${ALLOWED_ORIGINS.join(', ')}`);
        console.log(`   Helmet: ativo`);
        console.log(`   RBAC:   ativo`);
        console.log(`   JWT Blacklist: ativo (Redis)`);
        console.log(`   Socket.IO: ativo (/chat)`);
        console.log('=============================================');
    });
}

// ==========================================
// MIDDLEWARE GLOBAL
// ==========================================

function registerMiddleware(): void {
    // Métricas Prometheus — antes de todos os handlers para capturar 100% das requisições
    app.use(metricsMiddleware);

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

    // ── Health — Kubernetes probes (sem rate limit, sem auth, sem CORS) ─────────
    app.get('/health/live',  livenessCheck);
    app.get('/health/ready', readinessCheck);
    // Mantido por compatibilidade com CI e smoke tests existentes
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
    app.get('/api/v1/profile/achievements', playerLimiter, requireAuth, getAchievements);

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
        '/api/v1/gametypes/:gametypeId/patterns',
        playerLimiter, getGametypePatternsPublic
    );
    app.get(
        '/api/v1/admin/gametypes/:gametypeId/metadata',
        adminLimiter, requireAuth, requireRole('admin'), getGametypeMetadata
    );
    app.put(
        '/api/v1/admin/gametypes/:gametypeId/metadata',
        adminLimiter, requireAuth, requireRole('admin'), upsertGametypeMetadata
    );
    app.put(
        '/api/v1/admin/gametypes/:gametypeId',
        adminLimiter, requireAuth, requireRole('admin'), updateGametype
    );
    app.put(
        '/api/v1/admin/gametypes/:gametypeId/stages',
        adminLimiter, requireAuth, requireRole('admin'), saveStages
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
    app.put('/api/v1/admin/rooms/:roomId/nft-config',      adminLimiter,  requireAuth, requireRole('admin'), setRoomNft);
    app.get('/api/v1/rooms/:roomId/treasury',              playerLimiter, getRoomTreasury);

    // ── Admin: Monte Carlo ─────────────────────────────────────────────────
    app.post(
        '/api/v1/admin/simulate-weights',
        monteCarloLimiter, requireAuth, requireRole('admin'), simulateWeights
    );
    app.post(
        '/api/v1/admin/calibrate-weights',
        monteCarloLimiter, requireAuth, requireRole('admin'), calibrateWeights
    );
    app.post(
        '/api/v1/admin/suggest-combos',
        monteCarloLimiter, requireAuth, requireRole('admin'), suggestCombos
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
    app.get('/api/v1/nfts/my-assets',          playerLimiter, requireAuth, getMyNfts);
    app.get('/api/v1/nfts/eligible-discount',  playerLimiter, requireAuth, getEligibleDiscountNfts);
    app.post('/api/v1/nfts/sync-burns',        playerLimiter, requireAuth, syncBurns);

    // ── Config: tokens autorizados ───────────────────────────────────────
    app.get('/api/v1/config/tokens',                 playerLimiter, listTokens);
    app.post('/api/v1/admin/config/tokens',          adminLimiter,  requireAuth, requireRole('admin'), createToken);
    app.delete('/api/v1/admin/config/tokens/:id',    adminLimiter,  requireAuth, requireRole('admin'), deleteToken);

    // ── Winnings (JWT) ───────────────────────────────────────────────────
    app.get('/api/v1/player/winnings/:gameId', playerLimiter, requireAuth, getPlayerWinnings);
    app.post('/api/v1/player/winnings/batch', playerLimiter, requireAuth, getPlayerWinningsBatch);

    // ── Swap Quote (ADR-021) — público, somente leitura ──────────────────
    app.get('/api/v1/swap/pools',  playerLimiter, listSwapPools);
    app.get('/api/v1/swap/quote',  playerLimiter, getSwapQuote);

    // ── Drop Vault (ADR-011) ──────────────────────────────────────────────
    app.get('/api/v1/vault/deposits',         playerLimiter, requireAuth, listDeposits);
    app.get('/api/v1/vault/deposits/:depositId', playerLimiter, requireAuth, getDeposit);
    app.get('/api/v1/vault/allocations',      playerLimiter, requireAuth, listAllocations);
    app.post('/api/v1/vault/allocate',   adminLimiter, requireAuth, requireRole('admin', 'sponsor'), allocateDrop);
    app.post('/api/v1/vault/deallocate', adminLimiter, requireAuth, requireRole('admin', 'sponsor'), deallocateDrop);
    app.post('/api/v1/vault/reclaim',    playerLimiter, requireAuth, reclaimAsset);

    // ── Leaderboard (ADR-024) ─────────────────────────────────────────────────
    app.get('/api/v1/leaderboard',                  playerLimiter, getLeaderboardGlobal);
    app.get('/api/v1/leaderboard/xp',               playerLimiter, getLeaderboardXp);
    app.get('/api/v1/leaderboard/rooms/:roomId',    playerLimiter, getLeaderboardByRoom);

    // ── Chat ────────────────────────────────────────────────────────────────────
    app.get ('/api/v1/rooms/:roomId/chat', playerLimiter, requireAuth, getChatHistory);
    app.post('/api/v1/rooms/:roomId/chat', playerLimiter, requireAuth, saveChatMessage);
    app.post('/api/v1/internal/chat/system', requireInternalAuth, createSystemChatMessage);

    // ── News / Promoções (ADR-024) ────────────────────────────────────────────
    app.get   ('/api/v1/news',        playerLimiter, listNews);
    app.post  ('/api/v1/news',        adminLimiter,  requireAuth, requireRole('admin'), createNews);
    app.patch ('/api/v1/news/:id',    adminLimiter,  requireAuth, requireRole('admin'), updateNews);
    app.delete('/api/v1/news/:id',    adminLimiter,  requireAuth, requireRole('admin'), deleteNews);

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
