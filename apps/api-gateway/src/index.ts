// apps/api-gateway/src/index.ts

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectMongo, connectPostgres } from './database';
import { connectRedis } from './database/redis';
import { requireAuth } from './middleware/auth';
import { requestChallenge, verifyChallenge, ensureNonceTable } from './controllers/authController';
import { getProfile, updatePreferences } from './controllers/profileController';
import { generateTickets } from './controllers/ticketController';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 8080;

// ==========================================
// MIDDLEWARE BASE
// ==========================================
app.use(cors());
app.use(express.json());

// ==========================================
// INICIALIZAÇÃO ASSÍNCRONA
// ==========================================
async function bootstrap(): Promise<void> {
    // 1. Conecta aos bancos de dados
    await connectMongo();
    await connectPostgres();
    await connectRedis();

    // 2. Garante que a tabela de nonces existe no PostgreSQL (idempotente — CREATE IF NOT EXISTS)
    await ensureNonceTable();
    console.log('✅ [Bootstrap] Tabela auth_nonces verificada.');

    // 3. Registra as rotas
    registerRoutes();

    // 4. Sobe o servidor
    app.listen(PORT, () => {
        console.log('=============================================');
        console.log(`🌐 CryptoBingo: API Gateway na porta ${PORT}`);
        console.log('=============================================');
    });
}

// ==========================================
// ROTAS
// ==========================================
function registerRoutes(): void {

    // --- Health Check (público) ---
    app.get('/api/v1/health', (_req, res) => {
        res.status(200).json({ status: 'Gateway Online', timestamp: new Date() });
    });

    // --- Autenticação (públicas) ---
    // POST /api/v1/auth/challenge  — solicita nonce para assinar (ADR-006)
    // POST /api/v1/auth/verify     — envia assinatura e recebe JWT (ADR-006)
    app.post('/api/v1/auth/challenge', requestChallenge);
    app.post('/api/v1/auth/verify',    verifyChallenge);

    // --- Perfil (protegidas por JWT) ---
    // GET /api/v1/profile          — retorna perfil MongoDB do usuário autenticado
    // PUT /api/v1/profile          — atualiza nickname/locale
    app.get('/api/v1/profile', requireAuth, getProfile);
    app.put('/api/v1/profile', requireAuth, updatePreferences);

    // --- Geração de Cartelas (protegida por JWT) ---
    // POST /api/v1/games/:gameId/tickets/generate
    //   Body:    { count: number }  (1–50)
    //   Returns: { game_id, account, count, tickets: [{ matrix, signature }] }
    //   Ref:     ADR-001, SPEC.md §2.1, §3.1, openapi.yaml
    app.post('/api/v1/games/:gameId/tickets/generate', requireAuth, generateTickets);
}

// ==========================================
// ENTRYPOINT
// ==========================================
bootstrap().catch((error) => {
    console.error('❌ [Bootstrap] Falha crítica na inicialização:', error);
    process.exit(1);
});
