import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ==========================================
// EXTENSÃO DO TIPO REQUEST DO EXPRESS
//
// Injeta o campo `user` no Request para que os controllers
// downstream acessem o wallet do usuário autenticado
// sem precisar parsear o token novamente.
// ==========================================
declare global {
    namespace Express {
        interface Request {
            user?: {
                wallet: string;  // ex: "jogador1"
            };
        }
    }
}

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    // Falha em tempo de inicialização — melhor do que falhar silenciosamente em runtime
    throw new Error('❌ ERRO CRÍTICO: JWT_SECRET não definido no .env');
}

/**
 * Middleware de autenticação JWT.
 *
 * Extrai o token do header `Authorization: Bearer <token>`,
 * valida a assinatura e injeta `req.user.wallet` para uso nos controllers.
 *
 * Retorna 401 em qualquer falha de autenticação — sem vazar detalhes
 * internos (ex: token expirado vs assinatura inválida) para o cliente,
 * conforme boas práticas de segurança defensiva.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Token de autenticação ausente.' });
        return;
    }

    const token = authHeader.slice(7); // Remove o prefixo "Bearer "

    try {
        const payload = jwt.verify(token, JWT_SECRET!) as { wallet: string };

        if (!payload.wallet) {
            res.status(401).json({ error: 'Token inválido: campo wallet ausente.' });
            return;
        }

        req.user = { wallet: payload.wallet };
        next();
    } catch {
        // Captura jwt.TokenExpiredError, jwt.JsonWebTokenError, etc.
        // Resposta genérica intencional — não informar o motivo exato ao cliente.
        res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
}
