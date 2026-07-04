// apps/api-gateway/src/controllers/authController.ts
// Autenticação JWT via assinatura de carteira Antelope.
//
// Hardening desta versão:
//   - JWT emitido com `jti` (UUID v4) para suporte a blacklist de revogação
//   - Verificação on-chain da public_key contra permissão `active` do wallet
//     (controlada por feature flag VERIFY_KEY_ONCHAIN — padrão false em dev)
//   - Endpoint POST /auth/logout que revoga o token via Redis
//
// DOIS MODOS de assinatura em verifyChallenge:
//   [DEV]  transactionPayload ausente → SHA256(nonce) assinado com PrivateKey
//   [PROD] transactionPayload presente → transaction bingogamectr:userlogin
//
// Ref: ADR-006

import { Request, Response }                         from 'express';
import jwt                                           from 'jsonwebtoken';
import crypto                                        from 'node:crypto';
import { v4 as uuidv4 }                             from 'uuid';
import { Signature, Checksum256, Transaction, Serializer } from '@wharfkit/antelope';
import { pgPool }                                    from '../database';
import { rpcClient }                                 from '@cryptobingo/blockchain-core';
import { revokeToken }                               from '../middleware/auth';
import { logger } from '../middleware/logger';
import { getRequestId } from '../middleware/requestId';

// ==========================================
// CONFIGURAÇÃO
// ==========================================

const JWT_SECRET          = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN      = '24h';
const JWT_EXPIRES_SECONDS = 24 * 60 * 60; // 86400s — para cálculo do TTL de revogação
const NONCE_TTL_MS        = 5 * 60 * 1000; // 5 minutos

// Feature flag — ativa verificação on-chain da chave pública
// Desabilitado em dev (nó local não tem contas WAX reais)
const VERIFY_KEY_ONCHAIN = process.env.VERIFY_KEY_ONCHAIN === 'true';

// ==========================================
// HELPERS
// ==========================================

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

async function purgeExpiredNonces(): Promise<void> {
    await pgPool.query(`DELETE FROM auth_nonces WHERE expires_at < NOW()`);
}

// ==========================================
// POST /api/v1/auth/challenge
// ==========================================

export async function requestChallenge(req: Request, res: Response): Promise<void> {
    const { wallet } = req.body;

    if (!wallet || typeof wallet !== 'string' || wallet.trim().length === 0) {
        res.status(400).json({ error: 'Campo "wallet" é obrigatório.' });
        return;
    }

    const sanitizedWallet = wallet.trim().toLowerCase();
    if (!/^[a-z1-5.]{1,13}$/.test(sanitizedWallet)) {
        res.status(400).json({ error: 'Formato de wallet inválido.' });
        return;
    }

    try {
        await purgeExpiredNonces();

        const nonce     = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

        await pgPool.query(
            `INSERT INTO auth_nonces (wallet, nonce, expires_at) VALUES ($1, $2, $3)`,
            [sanitizedWallet, nonce, expiresAt]
        );

        res.status(200).json({
            nonce,
            expires_at: expiresAt.toISOString(),
            message:    `Assine este nonce com a permissão "active" ou "owner" da carteira ${sanitizedWallet}.`,
        });
    } catch (error) {
        logger.error({ err: error, tag: 'Auth' }, 'Erro ao gerar challenge');
        res.status(500).json({ error: 'Erro interno ao gerar challenge.' });
    }
}

// ==========================================
// POST /api/v1/auth/verify
// ==========================================

export async function verifyChallenge(req: Request, res: Response): Promise<void> { // NOSONAR — validação de challenge WAX com múltiplos caminhos (signature/transactionPayload/nonce TTL/JWT); complexidade inerente à autenticação on-chain
    const { wallet, nonce, signature, public_key, transactionPayload } = req.body;

    if (!wallet || !nonce || !signature || !public_key) {
        res.status(400).json({ error: 'Campos obrigatórios: wallet, nonce, signature, public_key.' });
        return;
    }

    try {
        // ── 1. Valida o nonce no banco ────────────────────────────────────────
        const result = await pgPool.query(
            `SELECT expires_at FROM auth_nonces WHERE wallet = $1 AND nonce = $2`,
            [wallet, nonce]
        );

        if (result.rowCount === 0) {
            res.status(401).json({ error: 'Challenge inválido ou expirado.' });
            return;
        }

        const expiresAt = new Date(result.rows[0].expires_at);
        if (expiresAt < new Date()) {
            await pgPool.query(
                `DELETE FROM auth_nonces WHERE wallet = $1 AND nonce = $2`,
                [wallet, nonce]
            );
            res.status(401).json({ error: 'Challenge expirado. Solicite um novo.' });
            return;
        }

        // ── 2. Verifica a assinatura (dois modos) ─────────────────────────────
        const sig = Signature.from(signature);
        let recoveredPubKey: string;

        if (transactionPayload !== undefined && transactionPayload !== null) {
            // ── MODO PRODUÇÃO: verifica via transaction.id (bingogamectr:userlogin) ─
            try {
                const transaction = Transaction.from(transactionPayload);
                const actionDataHex = transaction.actions[0]?.data?.toString() ?? '';
                // userlogin bytes(nonce_data): ABI-encoded = varuint32(len) + raw_bytes
                // nonces < 127 bytes → varuint32 = 1 byte (próprio len)
                const actionBuf = Buffer.from(actionDataHex, 'hex');
                const nonceLen  = actionBuf[0];
                const rawNonce  = actionBuf.subarray(1, 1 + nonceLen).toString('utf-8');

                if (rawNonce !== nonce) {
                    res.status(401).json({ error: 'Nonce na transação não corresponde ao challenge.' });
                    return;
                }

                // signing_digest = SHA256(chain_id || packed_trx || cfd_hash)
                // Wharfkit sempre usa cfd_hash = 32 zero bytes
                const chainId = Checksum256.from(process.env.CHAIN_ID!);
                const txBytes = Serializer.encode({ object: transaction });
                const fullDigest = Checksum256.hash(
                    Buffer.concat([
                        Buffer.from(chainId.array),
                        Buffer.from(txBytes.array),
                        Buffer.alloc(32),
                    ])
                );
                recoveredPubKey = sig.recoverDigest(fullDigest).toString();
            } catch (txErr) {
                logger.error({ err: txErr, tag: 'Auth' }, 'Erro ao reconstruir transação');
                res.status(401).json({ error: 'transactionPayload inválido.' });
                return;
            }
        } else {
            // ── MODO DEV: verifica via SHA256(nonce) ─────────────────────────
            const digest = Checksum256.hash(Buffer.from(nonce, 'utf-8'));
            recoveredPubKey = sig.recoverDigest(digest).toString();
        }

        if (recoveredPubKey !== public_key) {
            res.status(401).json({ error: 'Assinatura criptográfica inválida.' });
            return;
        }

        // ── 3. Verificação on-chain da chave pública (feature flag) ───────────
        // Confirma que a public_key está autorizada na permissão `active` ou `owner` do wallet.
        // Habilita login com qualquer uma das duas permissões.
        if (VERIFY_KEY_ONCHAIN) {
            try {
                const accountInfo  = await rpcClient.v1.chain.get_account(wallet);
                const allPermKeys  = accountInfo.permissions.flatMap((p: any) =>
                    (p.required_auth?.keys ?? []).map((k: any) => ({
                        permission: String(p.perm_name),
                        key:        k.key.toString(),
                    }))
                );

                const matchedPerm = allPermKeys.find(
                    (k: any) => k.key === public_key
                );

                if (!matchedPerm) {
                    logger.warn({ tag: 'Auth' }, `Chave não autorizada on-chain: ${wallet} / ${public_key}`);
                    res.status(401).json({ error: 'Chave pública não autorizada para esta conta.' });
                    return;
                }

                logger.info({ tag: 'Auth' }, `Chave verificada via permissão "${matchedPerm.permission}": ${wallet}`);
            } catch (rpcErr) {
                // Falha no nó RPC — não bloqueia o login (fail-open com log)
                // Em produção alta-segurança: mudar para fail-closed
                logger.error({ err: rpcErr, tag: 'Auth' }, 'Erro ao verificar chave on-chain (fail-open)');
            }
        }

        // ── 4. Invalida o nonce (uso único) ───────────────────────────────────
        await pgPool.query(
            `DELETE FROM auth_nonces WHERE wallet = $1 AND nonce = $2`,
            [wallet, nonce]
        );

        // ── 5. Emite o JWT com jti ────────────────────────────────────────────
        // jti = JWT ID único (UUID v4) — permite revogação individual no Redis
        const jti   = uuidv4();
        const token = jwt.sign(
            { wallet, jti },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        logger.info({ tag: 'Auth' }, `Login: ${wallet} | ` +
            `modo: ${transactionPayload ? 'produção' : 'dev'} | ` +
            `onchain: ${VERIFY_KEY_ONCHAIN}`
        );

        res.status(200).json({ token });

    } catch (error) {
        logger.error({ err: error, tag: 'Auth' }, 'Erro ao verificar challenge');
        res.status(500).json({ error: 'Erro interno ao verificar assinatura.' });
    }
}

// ==========================================
// POST /api/v1/auth/logout
// Revoga o token atual adicionando seu jti ao Redis.
// ==========================================

export async function logout(req: Request, res: Response): Promise<void> {
    const { jti } = req.user ?? {};

    if (!jti) {
        // Token sem jti (emitido por versão anterior) — logout sem revogação
        res.status(200).json({ message: 'Sessão encerrada.' });
        return;
    }

    // Extrai o campo exp do token para calcular o TTL da blacklist
    const authHeader = req.headers.authorization ?? '';
    const token      = authHeader.slice(7);

    try {
        const payload = jwt.decode(token) as { exp?: number } | null;
        const exp     = payload?.exp ?? Math.floor(Date.now() / 1000) + JWT_EXPIRES_SECONDS;

        await revokeToken(jti, exp);
        logger.info({ tag: 'Auth' }, `Logout: ${req.user?.wallet} (jti: ${jti})`);
    } catch (err) {
        logger.error({ err: err, tag: 'Auth' }, 'Erro ao revogar token no logout');
        // Não bloqueia o logout mesmo se a revogação falhar
    }

    res.status(200).json({ message: 'Sessão encerrada com sucesso.' });
}
