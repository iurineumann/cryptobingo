// apps/frontend/src/hooks/useAuth.ts
// Fluxo de autenticação JWT via assinatura de carteira.
//
// DOIS MODOS — selecionados automaticamente conforme o ambiente:
//
// [DEV] WalletPluginPrivateKey:
//   Assina SHA256(nonce) diretamente com PrivateKey.from(devKey).signDigest().
//   Zero chamadas RPC — não precisa de nó local acessível pelo browser.
//   O servidor verifica via Signature.recoverDigest(digest).
//
// [PRODUÇÃO] Anchor / Cloud Wallet:
//   Monta transação eosio.null:nonce com broadcast:false para obter assinatura.
//   O Wharfkit faz getInfo() via proxy do Vite (/v1 → localhost:8888).
//   O servidor reconstrói a transação e verifica via transaction.id.
//
// A distinção no servidor: se `transactionPayload` vier no body → modo produção;
// caso contrário → modo dev (digest puro).
//
// Ref: ADR-006

import { useState, useCallback } from 'react';
import { Session }               from '@wharfkit/session';
import { PrivateKey, Checksum256, Bytes } from '@wharfkit/antelope';
import {
    requestAuthChallenge,
    verifyAuthChallenge,
    getAuthToken,
    clearAuthToken,
} from '../services/api';

function isJwtExpired(token: string): boolean {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return Date.now() >= (payload.exp * 1000);
    } catch {
        return true;
    }
}

export interface UseAuthReturn {
    isAuthenticating: boolean;
    authError:        string | null;
    authenticateSession: (session: Session) => Promise<boolean>;
}

export function useAuth(): UseAuthReturn {
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authError,        setAuthError]         = useState<string | null>(null);

    const authenticateSession = useCallback(async (session: Session): Promise<boolean> => {
        // Reutiliza token existente se ainda válido
        const existing = getAuthToken();
        if (existing && !isJwtExpired(existing)) return true;
        if (existing) clearAuthToken();

        setIsAuthenticating(true);
        setAuthError(null);

        try {
            const wallet = String(session.actor);

            // ── Passo 1: Solicita o nonce ─────────────────────────────────────
            const { nonce } = await requestAuthChallenge(wallet);

            // ── Passo 2: Detecta o modo de assinatura ─────────────────────────
            const isDevPlugin = (session.walletPlugin as any)?.id === 'wallet-plugin-privatekey'
                || (session.walletPlugin?.constructor?.name ?? '').includes('PrivateKey');

            if (isDevPlugin && import.meta.env.DEV) {
                // ── MODO DEV: assina o digest diretamente sem chamada RPC ─────
                return await signWithPrivateKey(session, wallet, nonce, setAuthError);
            } else {
                // ── MODO PRODUÇÃO: assina via transação eosio.null:nonce ──────
                return await signWithTransaction(session, wallet, nonce, setAuthError);
            }

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

// ==========================================
// MODO DEV — PrivateKey direta (sem RPC)
// ==========================================

async function signWithPrivateKey(
    session:       Session,
    wallet:        string,
    nonce:         string,
    setAuthError:  (msg: string | null) => void,
): Promise<boolean> {
    const devKey = import.meta.env.VITE_DEV_PRIVATE_KEY;

    if (!devKey) {
        setAuthError('VITE_DEV_PRIVATE_KEY não definida no .env local.');
        return false;
    }

    // Assina SHA256(nonce) com a chave privada de dev — zero chamadas RPC
    const privateKey = PrivateKey.from(devKey);
    const digest     = Checksum256.hash(Buffer.from(nonce, 'utf-8'));
    const signature  = privateKey.signDigest(digest);
    const publicKey  = privateKey.toPublic().toString();

    // Envia digest puro — sem transactionPayload (server usa modo digest)
    await verifyAuthChallenge(wallet, nonce, signature.toString(), publicKey);

    console.log(`✅ [Auth/Dev] JWT obtido para ${wallet} via PrivateKey.signDigest()`);
    return true;
}

// ==========================================
// MODO PRODUÇÃO — transação bingogamectr:userlogin
// ==========================================

async function signWithTransaction(
    session:      Session,
    wallet:       string,
    nonce:        string,
    setAuthError: (msg: string | null) => void,
): Promise<boolean> {
    // Garante que o Wharfkit use o proxy do Vite para chamadas RPC em dev.
    // Em produção, a URL já aponta para o nó correto via VITE_RPC_URL.
    // Isso não é um monkey-patch de segurança — é configuração de URL de transporte.
    if (import.meta.env.DEV) {
        try {
            (session.client.provider as any).url = window.location.origin;
        } catch {
            // Silencia: alguns providers não permitem mutação de URL
        }
    }

    const contract = import.meta.env.VITE_CONTRACT_ACCOUNT || 'bingogamectr';
    const nonceBytes = new TextEncoder().encode(nonce);

    const result = await session.transact(
        {
            action: {
                account:       contract,
                name:          'userlogin',
                authorization: [session.permissionLevel],
                data:          { nonce_data: nonceBytes },
            },
        },
        { broadcast: false }, // Não transmite — apenas assina localmente
    );

    if (!result.signatures?.length) {
        setAuthError('Nenhuma assinatura retornada pelo plugin de carteira.');
        return false;
    }

    // result.transaction é ResolvedTransaction (decoded data, sem toJSON)
    // Reconstruímos o ABI-encoding original para transaction.id bater
    const rtx        = result.transaction!;
    const sig        = result.signatures[0];
    const signature  = sig.toString();
    const publicKey  = sig.recoverDigest(result.resolved!.signingDigest).toString();
    const action0    = rtx.actions[0];
    const rawNonce   = (action0.data.nonce_data as any).array as Uint8Array;
    const prefixed   = new Uint8Array(1 + rawNonce.length);
    prefixed[0] = rawNonce.length; // varuint32 para len < 128
    prefixed.set(rawNonce, 1);
    const dataHex    = Bytes.from(prefixed).toString();
    const txPayload  = {
        expiration:            rtx.expiration,
        ref_block_num:         rtx.ref_block_num,
        ref_block_prefix:      rtx.ref_block_prefix,
        max_net_usage_words:   rtx.max_net_usage_words,
        max_cpu_usage_ms:      rtx.max_cpu_usage_ms,
        delay_sec:             rtx.delay_sec,
        context_free_actions:  [] as any[],
        actions: [{
            account:       action0.account,
            name:          action0.name,
            authorization: action0.authorization,
            data:          dataHex,
        }],
        transaction_extensions: [] as any[],
        signatures: result.signatures,
    };

    // Envia com transactionPayload — server usa modo transação
    await verifyAuthChallenge(wallet, nonce, signature, publicKey, txPayload);

    console.log(`✅ [Auth/Prod] JWT obtido para ${wallet} via ${contract}:userlogin`);
    return true;
}
