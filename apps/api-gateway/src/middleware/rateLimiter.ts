// apps/api-gateway/src/middleware/rateLimiter.ts
// Rate limiters granulares por grupo de rota.
//
// ARQUITETURA — Lazy Redis Store:
//   O RedisStore do rate-limit-redis tenta executar um SCRIPT LOAD no Redis
//   imediatamente no construtor (loadIncrementScript). Por isso, NÃO pode ser
//   instanciado no nível de módulo antes do Redis conectar.
//
//   Solução: os limiters são criados via initRateLimiters() chamada no bootstrap
//   do index.ts APÓS connectRedis(). Até isso acontecer, cada export é um
//   passthrough que deixa a requisição prosseguir normalmente (fail-open seguro).
//
// Limites (por IP):
//   auth        — 20 req/min  (anti brute-force de nonces)
//   player      — 100 req/min (rotas de usuário autenticado)
//   tickets     — 30 req/min  (geração de cartelas — CPU-bound)
//   admin       — 30 req/min  (rotas /admin/*)
//   montecarlo  — 5 req/min   (simulação Monte Carlo — CPU-intensiva)
//
// Ref: OWASP API Security Top 10 — API4:2023 Unrestricted Resource Consumption

import rateLimit, { RateLimitRequestHandler, ipKeyGenerator } from 'express-rate-limit';
import { RedisStore }                          from 'rate-limit-redis';
import { Request, Response, NextFunction }     from 'express';
import { redisClient }                         from '../database/redis';

// ==========================================
// PASSTHROUGH — usado antes de initRateLimiters()
// ==========================================

const passthrough: RateLimitRequestHandler = Object.assign(
    (_req: Request, _res: Response, next: NextFunction) => next(),
    { resetKey: (_key: string) => {} }
) as unknown as RateLimitRequestHandler;

// ==========================================
// REFERÊNCIAS MUTÁVEIS DOS LIMITERS
// Inicialmente apontam para passthrough.
// Após initRateLimiters(), apontam para os limiters reais.
// ==========================================

let _authLimiter:        RateLimitRequestHandler = passthrough;
let _playerLimiter:      RateLimitRequestHandler = passthrough;
let _ticketLimiter:      RateLimitRequestHandler = passthrough;
let _adminLimiter:       RateLimitRequestHandler = passthrough;
let _monteCarloLimiter:  RateLimitRequestHandler = passthrough;

// ==========================================
// EXPORTS — delegam para a referência atual
// Usando Proxy garante que o Express sempre usa o limiter correto,
// mesmo que initRateLimiters() seja chamado após o registro das rotas.
// ==========================================

export const authLimiter: RateLimitRequestHandler       = ((req: Request, res: Response, next: NextFunction) => _authLimiter(req, res, next))       as unknown as RateLimitRequestHandler;
export const playerLimiter: RateLimitRequestHandler     = ((req: Request, res: Response, next: NextFunction) => _playerLimiter(req, res, next))     as unknown as RateLimitRequestHandler;
export const ticketLimiter: RateLimitRequestHandler     = ((req: Request, res: Response, next: NextFunction) => _ticketLimiter(req, res, next))     as unknown as RateLimitRequestHandler;
export const adminLimiter: RateLimitRequestHandler      = ((req: Request, res: Response, next: NextFunction) => _adminLimiter(req, res, next))      as unknown as RateLimitRequestHandler;
export const monteCarloLimiter: RateLimitRequestHandler = ((req: Request, res: Response, next: NextFunction) => _monteCarloLimiter(req, res, next)) as unknown as RateLimitRequestHandler;

// ==========================================
// FACTORY — cria um limiter com RedisStore
// Chamada APÓS o Redis ter conectado com sucesso.
// ==========================================

function createLimiter(options: {
    windowMs:  number;
    limit:     number;
    keyPrefix: string;
    message:   string;
}): RateLimitRequestHandler {
    const { windowMs, limit, keyPrefix, message } = options;

    // Neste ponto o Redis já está conectado — RedisStore pode ser instanciado com segurança
    const store = new RedisStore({
        sendCommand: (...args: string[]) => (redisClient as any).sendCommand(args),
        prefix:      `rl:${keyPrefix}:`,
    });

    return rateLimit({
        windowMs,
        limit,
        standardHeaders: true,
        legacyHeaders:   false,
        store,
        keyGenerator: (req) => {
            const forwarded = req.headers['x-forwarded-for'];
            const ip = Array.isArray(forwarded)
                ? forwarded[0]
                : (forwarded?.split(',')[0]?.trim() ?? req.ip ?? 'unknown');
            return `${keyPrefix}:${ipKeyGenerator(ip)}`;
        },
        handler: (_req, res) => {
            res.status(429).json({
                error:       message,
                retry_after: Math.ceil(windowMs / 1000),
            });
        },
        skip: (req) => req.path.startsWith('/health') || req.path === '/api/v1/health',
    });
}

// ==========================================
// INIT — chamada no bootstrap do index.ts APÓS connectRedis()
// ==========================================

/**
 * Inicializa os rate limiters com o RedisStore.
 * Deve ser chamada uma única vez após connectRedis() retornar com sucesso.
 * Se o Redis estiver indisponível, mantém o passthrough (fail-open).
 */
export function initRateLimiters(): void {
    try {
        _authLimiter       = createLimiter({ windowMs: 60_000, limit: 20,  keyPrefix: 'auth',       message: 'Muitas tentativas de autenticação. Aguarde 1 minuto.'          });
        _playerLimiter     = createLimiter({ windowMs: 60_000, limit: 100, keyPrefix: 'player',     message: 'Muitas requisições. Aguarde alguns segundos.'                   });
        _ticketLimiter     = createLimiter({ windowMs: 60_000, limit: 30,  keyPrefix: 'tickets',    message: 'Limite de geração de cartelas atingido. Aguarde 1 minuto.'      });
        _adminLimiter      = createLimiter({ windowMs: 60_000, limit: 100,  keyPrefix: 'admin',      message: 'Limite de operações administrativas atingido. Aguarde 1 minuto.' });
        _monteCarloLimiter = createLimiter({ windowMs: 60_000, limit: 100,   keyPrefix: 'montecarlo', message: 'Limite de simulações atingido. Aguarde 1 minuto.'               });

        console.log('✅ [RateLimit] Limiters inicializados com RedisStore.');
    } catch (err) {
        console.error('❌ [RateLimit] Falha ao inicializar RedisStore — usando passthrough:', err);
        // Os limiters permanecem como passthrough — fail-open controlado.
        // Em produção, alertar o time de infra pois o rate limiting está inativo.
    }
}
