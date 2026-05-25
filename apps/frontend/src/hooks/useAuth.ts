// apps/frontend/src/hooks/useAuth.ts
// Hook responsável pelo fluxo de autenticação JWT via assinatura de carteira.
//
// Fluxo (ADR-006):
//   1. Solicita nonce ao servidor (POST /auth/challenge)
//   2. Assina SHA256(nonce) com a chave active da sessão Wharfkit
//   3. Envia assinatura + public_key para o servidor (POST /auth/verify)
//   4. Armazena o JWT retornado via setAuthToken()
//
// Ref: ADR-006, openapi.yaml /auth/challenge + /auth/verify

import { useState, useCallback } from 'react';
import { Session } from '@wharfkit/session';
import { Checksum256 } from '@wharfkit/antelope';
import { requestAuthChallenge, verifyAuthChallenge, getAuthToken } from '../services/api';

export interface UseAuthReturn {
    isAuthenticating: boolean;
    authError: string | null;
    authenticateSession: (session: Session) => Promise<boolean>;
}

export function useAuth(): UseAuthReturn {
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    const authenticateSession = useCallback(async (session: Session): Promise<boolean> => {
        // Reutiliza token existente sem novo roundtrip
        if (getAuthToken()) return true;

        setIsAuthenticating(true);
        setAuthError(null);

        try {
            const wallet = String(session.actor);

            // ── Passo 1: Solicita o nonce ─────────────────────────────────────
            const { nonce } = await requestAuthChallenge(wallet);

            // ── Passo 2: Assina SHA256(nonce) com a chave active da sessão ────
            // Reproduz o mesmo digest que o servidor usa em Signature.recoverDigest().
            // Ref: ADR-006 — "O cliente assina SHA256(nonce) com permissão active."
            const digest = Checksum256.hash(Buffer.from(nonce, 'utf-8'));

            // session.sign() assina o digest off-chain sem transação on-chain.
            // Compatível com Anchor (mobile/desktop) e WAX Cloud Wallet.
            const { signatures } = await session.sign({
                transaction: undefined as any,
                digests: [digest],
            });

            if (!signatures || signatures.length === 0) {
                throw new Error('Nenhuma assinatura retornada pelo plugin de carteira.');
            }

            const signature  = signatures[0].toString(); // "SIG_K1_..."
            const publicKey  = session.publicKey?.toString();

            if (!publicKey) {
                throw new Error('Chave pública não disponível na sessão Wharfkit.');
            }

            // ── Passo 3: Verifica e obtém JWT (armazenado por verifyAuthChallenge) ──
            await verifyAuthChallenge(wallet, nonce, signature, publicKey);

            console.log(`✅ [Auth] JWT obtido para ${wallet}`);
            return true;

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Falha na autenticação.';
            console.error('[Auth] Erro no fluxo JWT:', err);
            setAuthError(message);
            return false;
        } finally {
            setIsAuthenticating(false);
        }
    }, []);

    return { isAuthenticating, authError, authenticateSession };
}
