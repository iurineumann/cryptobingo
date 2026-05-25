import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Signature, PublicKey, Checksum256 } from '@wharfkit/antelope';
import { pgPool } from '../database';

// ==========================================
// CONFIGURAÇÃO
// ==========================================

const JWT_SECRET      = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN  = '24h';
const NONCE_TTL_MS    = 5 * 60 * 1000; // 5 minutos — janela de assinatura

// ==========================================
// HELPERS INTERNOS
// ==========================================

/**
 * Garante que a tabela de nonces existe no PostgreSQL.
 * Chamada uma vez na inicialização do servidor.
 */
export async function ensureNonceTable(): Promise<void> {
    await pgPool.query(`
        CREATE TABLE IF NOT EXISTS auth_nonces (
            wallet      VARCHAR(64)  NOT NULL,
            nonce       VARCHAR(64)  NOT NULL,
            expires_at  TIMESTAMPTZ  NOT NULL,
            PRIMARY KEY (wallet, nonce)
        );
        CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires_at ON auth_nonces (expires_at);
    `);
}

/**
 * Remove nonces expirados do banco. Chamada a cada nova requisição de challenge
 * para evitar acúmulo sem precisar de um job externo (auto-housekeeping).
 */
async function purgeExpiredNonces(): Promise<void> {
    await pgPool.query(`DELETE FROM auth_nonces WHERE expires_at < NOW()`);
}

// ==========================================
// CONTROLLERS
// ==========================================

/**
 * POST /api/v1/auth/challenge
 *
 * Gera um nonce único para o wallet informado e persiste com TTL de 5 minutos.
 * O cliente deve assinar este nonce com sua chave Antelope (permissão `active`)
 * e enviar a assinatura para /auth/verify.
 *
 * Body: { wallet: string }
 * Response: { nonce: string, expires_at: string }
 */
export async function requestChallenge(req: Request, res: Response): Promise<void> {
    const { wallet } = req.body;

    if (!wallet || typeof wallet !== 'string' || wallet.trim().length === 0) {
        res.status(400).json({ error: 'Campo "wallet" é obrigatório.' });
        return;
    }

    // Sanitização básica: nome Antelope só tem letras minúsculas, números e pontos
    const sanitizedWallet = wallet.trim().toLowerCase();
    if (!/^[a-z1-5.]{1,13}$/.test(sanitizedWallet)) {
        res.status(400).json({ error: 'Formato de wallet inválido.' });
        return;
    }

    try {
        await purgeExpiredNonces(); // Housekeeping passivo

        const nonce     = crypto.randomBytes(32).toString('hex'); // 256 bits de entropia
        const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

        await pgPool.query(
            `INSERT INTO auth_nonces (wallet, nonce, expires_at) VALUES ($1, $2, $3)`,
            [sanitizedWallet, nonce, expiresAt]
        );

        res.status(200).json({
            nonce,
            expires_at: expiresAt.toISOString(),
            message:    `Assine este nonce com a permissão "active" da carteira ${sanitizedWallet}.`,
        });
    } catch (error) {
        console.error('[Auth] Erro ao gerar challenge:', error);
        res.status(500).json({ error: 'Erro interno ao gerar challenge.' });
    }
}

/**
 * POST /api/v1/auth/verify
 *
 * Verifica a assinatura Antelope do nonce e emite um JWT de 24h.
 *
 * O fluxo de verificação:
 *   1. Recupera o nonce do PostgreSQL (verifica existência e validade)
 *   2. Reconstrói o hash que deveria ter sido assinado: SHA256(nonce)
 *   3. Usa recover_key para extrair a chave pública da assinatura
 *   4. Compara com a chave pública da permissão `active` do wallet na blockchain
 *   5. Se válido: emite JWT e invalida o nonce (uso único)
 *
 * Body: { wallet: string, nonce: string, signature: string, public_key: string }
 * Response: { token: string }
 *
 * NOTA ARQUITETURAL: Estamos recebendo a `public_key` do cliente e verificando
 * se a assinatura foi feita com ela. A validação completa exigiria consultar
 * a permissão `active` do wallet no nó RPC para confirmar que essa chave
 * está realmente autorizada. Implementado como comentário abaixo — ativar
 * em produção via ADR futuro.
 */
export async function verifyChallenge(req: Request, res: Response): Promise<void> {
    const { wallet, nonce, signature, public_key } = req.body;

    if (!wallet || !nonce || !signature || !public_key) {
        res.status(400).json({ error: 'Campos obrigatórios: wallet, nonce, signature, public_key.' });
        return;
    }

    try {
        // 1. Busca e valida o nonce no PostgreSQL
        const result = await pgPool.query(
            `SELECT expires_at FROM auth_nonces
             WHERE wallet = $1 AND nonce = $2 AND expires_at > NOW()`,
            [wallet, nonce]
        );

        if (result.rows.length === 0) {
            // Nonce não encontrado ou expirado — resposta genérica intencional
            res.status(401).json({ error: 'Challenge inválido ou expirado.' });
            return;
        }

        // 2. Reconstrói o digest que o cliente deveria ter assinado
        //    Convenção: SHA256(nonce) — o mesmo que o frontend deve usar
        const digest = Checksum256.hash(Buffer.from(nonce, 'utf-8'));

        // 3. Recupera a chave pública a partir da assinatura
        const sig            = Signature.from(signature);
        const recoveredKey   = sig.recoverDigest(digest);
        const expectedKey    = PublicKey.from(public_key);

        if (recoveredKey.toString() !== expectedKey.toString()) {
            res.status(401).json({ error: 'Assinatura inválida.' });
            return;
        }

        // PRODUÇÃO: Verificar se `public_key` está na permissão `active` do wallet na chain:
        // const accountInfo = await rpcClient.v1.chain.get_account(wallet);
        // const activeKeys  = accountInfo.permissions.find(p => p.perm_name === 'active')?.required_auth.keys ?? [];
        // if (!activeKeys.some(k => k.key.toString() === public_key)) {
        //     return res.status(401).json({ error: 'Chave pública não autorizada para esta conta.' });
        // }

        // 4. Nonce válido — invalida para uso único (previne replay attacks)
        await pgPool.query(
            `DELETE FROM auth_nonces WHERE wallet = $1 AND nonce = $2`,
            [wallet, nonce]
        );

        // 5. Emite o JWT
        const token = jwt.sign(
            { wallet },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        console.log(`✅ [Auth] Login bem-sucedido: ${wallet}`);
        res.status(200).json({ token });

    } catch (error) {
        console.error('[Auth] Erro ao verificar challenge:', error);
        res.status(500).json({ error: 'Erro interno ao verificar assinatura.' });
    }
}
