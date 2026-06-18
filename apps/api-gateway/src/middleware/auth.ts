// apps/api-gateway/src/middleware/auth.ts
// Middleware de autenticação JWT com suporte a blacklist via Redis.
//
// Melhorias de hardening em relação à versão anterior:
//   1. JWT emitido com `jti` (JWT ID = UUID v4) para identificação única
//   2. Verificação de blacklist no Redis antes de aceitar o token
//      (permite revogação imediata sem expiração natural — ADR-006)
//   3. Função `revokeToken` exportada para uso no logout
//
// Formato da chave Redis: jwt:blacklist:{jti}
// TTL: igual ao tempo restante de expiração do token (sem overhead de armazenamento)
//
// Ref: ADR-006 (Blacklist de JWT revogados)

import { Request, Response, NextFunction } from 'express';
import jwt                                 from 'jsonwebtoken';
import { redisClient }                     from '../database/redis';

// ==========================================
// EXTENSÃO DO TIPO REQUEST DO EXPRESS
// ==========================================
declare global {
    namespace Express {
        interface Request {
            user?: {
                wallet: string;
                jti?:   string; // JWT ID — usado para revogação
            };
        }
    }
}

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('❌ ERRO CRÍTICO: JWT_SECRET não definido no .env');
}

// ==========================================
// BLACKLIST (ADR-006)
// ==========================================

const BLACKLIST_PREFIX = 'jwt:blacklist:';

/**
 * Revoga um JWT adicionando seu jti ao Redis com TTL até a expiração natural.
 * Chamado no logout ou ao detectar comprometimento de token.
 *
 * @param jti - JWT ID (campo `jti` do payload)
 * @param exp - Timestamp de expiração do token (campo `exp` do payload, em segundos)
 */
export async function revokeToken(jti: string, exp: number): Promise<void> {
    const ttlSeconds = Math.max(0, exp - Math.floor(Date.now() / 1000));
    if (ttlSeconds <= 0) return; // Token já expirou — não precisa revogar

    try {
        await redisClient.set(`${BLACKLIST_PREFIX}${jti}`, '1', { EX: ttlSeconds });
        console.log(`🔒 [Auth] Token revogado: jti=${jti} (TTL: ${ttlSeconds}s)`);
    } catch (err) {
        console.error('[Auth] Erro ao revogar token no Redis:', err);
        // Não lança — falha na revogação não deve bloquear o fluxo de logout
    }
}

/**
 * Verifica se um jti está na blacklist do Redis.
 * Retorna true se o token foi revogado.
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
    try {
        const val = await redisClient.get(`${BLACKLIST_PREFIX}${jti}`);
        return val !== null;
    } catch {
        // Fail-open: se o Redis estiver indisponível, aceita o token
        // (melhor do que negar todos os usuários durante uma queda de Redis)
        console.warn('[Auth] Redis indisponível para verificação de blacklist — fail-open.');
        return false;
    }
}

// ==========================================
// MIDDLEWARE requireAuth
// ==========================================

/**
 * Middleware de autenticação JWT.
 *
 * 1. Extrai o token do header Authorization: Bearer <token>
 * 2. Verifica a assinatura com JWT_SECRET
 * 3. Verifica se o jti está na blacklist do Redis
 * 4. Injeta req.user.wallet e req.user.jti para uso nos controllers
 *
 * Responde 401 em qualquer falha — sem vazar detalhes internos.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Token de autenticação ausente.' });
        return;
    }

    const token = authHeader.slice(7);

    try {
        const payload = jwt.verify(token, JWT_SECRET!) as {
            wallet: string;
            jti?:   string;
            exp?:   number;
        };

        if (!payload.wallet) {
            res.status(401).json({ error: 'Token inválido: campo wallet ausente.' });
            return;
        }

        // Verifica blacklist se o token tiver jti
        if (payload.jti) {
            const revoked = await isTokenRevoked(payload.jti);
            if (revoked) {
                res.status(401).json({ error: 'Token revogado. Faça login novamente.' });
                return;
            }
        }

        req.user = { wallet: payload.wallet, jti: payload.jti };
        next();

    } catch {
        res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
}
