// apps/frontend/src/utils/rpc.ts
// Utilitário unificado para consultas RPC à blockchain.
// Suporta dois modos:
//   - Com Session (autenticado): usa session.client.v1.chain.get_table_rows
//   - Sem Session (visitante):   usa fetch direto ao nó RPC via proxy Vite (/v1)
//
// Ref: ADR-015 (rota /room/:roomId/history pública)

import type { Session } from '@wharfkit/session';
import { getEffectiveRpcUrl } from './rpcStore';

export interface TableRowsParams {
    code:           string;
    scope:          string;
    table:          string;
    limit?:         number;
    reverse?:       boolean;
    json?:          boolean;
    lower_bound?:   string;
    upper_bound?:   string;
    index_position?: string;
    key_type?:      string;
}

export interface TableRowsResult {
    rows: unknown[];
    more: boolean;
    next_key?: string;
}

/**
 * Busca rows de uma tabela on-chain.
 * Usa session se disponível; caso contrário, faz fetch direto ao RPC via proxy.
 */
export async function fetchTableRows(
    params: TableRowsParams,
    session?: Session | null,
): Promise<TableRowsResult> {
    if (session) {
        // O Wharfkit retorna next_key como um tipo union de primitivos — normalizamos para string
        const res = await session.client.v1.chain.get_table_rows({
            ...params,
            json: true,
        } as Parameters<typeof session.client.v1.chain.get_table_rows>[0]);
        return {
            rows:     res.rows as unknown[],
            more:     res.more,
            next_key: res.next_key != null ? String(res.next_key) : undefined,
        };
    }

    // Acesso público (sem sessão) — DEVE usar a URL ABSOLUTA do nó RPC.
    // A SWA (Azure free tier) não tem backend/proxy, então um path relativo
    // '/v1/chain/...' cairia no próprio SWA → 405 Method Not Allowed (issue #219).
    // getEffectiveRpcUrl() resolve o nó configurado (localStorage > VITE_RPC_URL >
    // fallback greymass), o mesmo usado pelo SessionKit em services/wharfkit.ts.
    const base = getEffectiveRpcUrl().replace(/\/+$/, '');
    const res = await fetch(`${base}/v1/chain/get_table_rows`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ json: true, ...params }),
    });
    if (!res.ok) throw new Error(`RPC error: ${res.status}`);
    return res.json() as Promise<TableRowsResult>;
}
