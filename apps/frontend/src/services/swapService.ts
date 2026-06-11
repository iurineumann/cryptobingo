// apps/frontend/src/services/swapService.ts
// ADR-021 — Checkout Multi-Moeda: client para /api/v1/swap/*
//
// Lê pools e calcula cotações via API-gateway (somente leitura).
// A execução do swap acontece on-chain via Wharfkit — nenhuma chave é custodiada aqui.

import type { SwapQuote, SwapPoolSummary } from '@cryptobingo/shared-types';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL + '/api/v1';

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
}

/** Lista pools ativas do bingogameswp (cache 10s no servidor). */
export async function fetchSwapPools(): Promise<SwapPoolSummary[]> {
    const res = await fetch(`${API_BASE}/swap/pools`);
    const data = await handleResponse<{ pools: SwapPoolSummary[] }>(res);
    return data.pools;
}

export interface QuoteParams {
    fromContract:  string;   // ex: "bingogametkn"
    fromSymbol:    string;   // ex: "4,BINGO"
    toContract:    string;   // ex: "eosio.token"
    toSymbol:      string;   // ex: "8,WAX"
    amountOut:     string;   // unidades mínimas do token de destino
    gameEndTime?:  number;   // Unix timestamp (seconds) — limita TTL da cotação
}

/** Obtém cotação para converter fromToken → toToken, recebendo amountOut exato. */
export async function fetchSwapQuote(params: QuoteParams): Promise<SwapQuote> {
    const qs = new URLSearchParams({
        from_contract: params.fromContract,
        from_symbol:   params.fromSymbol,
        to_contract:   params.toContract,
        to_symbol:     params.toSymbol,
        amount_out:    params.amountOut,
        ...(params.gameEndTime !== undefined && { game_end_time: String(params.gameEndTime) }),
    });
    const res = await fetch(`${API_BASE}/swap/quote?${qs}`);
    return handleResponse<SwapQuote>(res);
}

/**
 * Dado um pool e a moeda da sala, retorna se o pool serve de caminho
 * direto de `fromContract/fromSymbol` para a moeda alvo.
 */
export function poolRoutesTo(
    pool:          SwapPoolSummary,
    toContract:    string,
    toSymbol:      string,
): boolean {
    return (
        (pool.token_a.contract === toContract && pool.token_a.symbol === toSymbol) ||
        (pool.token_b.contract === toContract && pool.token_b.symbol === toSymbol)
    );
}

/**
 * Dado um pool e a moeda de destino da sala, retorna o token alternativo
 * (o outro lado do par). Retorna null se o pool não envolver a moeda alvo.
 */
export function getAlternativeToken(
    pool:       SwapPoolSummary,
    toContract: string,
    toSymbol:   string,
): { contract: string; symbol: string; precision: number } | null {
    if (pool.token_a.contract === toContract && pool.token_a.symbol === toSymbol) {
        return pool.token_b;
    }
    if (pool.token_b.contract === toContract && pool.token_b.symbol === toSymbol) {
        return pool.token_a;
    }
    return null;
}

/**
 * Lê o saldo de um token na carteira WAX do usuário.
 * Usa get_table_rows diretamente no nodeos (sem passar pela API).
 */
export async function fetchTokenBalance(
    account:       string,
    tokenContract: string,
    symbolCode:    string,
): Promise<bigint> {
    const rpcUrl = import.meta.env.VITE_WAX_RPC_URL ?? 'http://127.0.0.1:8888';
    try {
        const res = await fetch(`${rpcUrl}/v1/chain/get_table_rows`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                code:        tokenContract,
                scope:       account,
                table:       'accounts',
                json:        true,
                limit:       1,
                lower_bound: symbolCode,
                upper_bound: symbolCode,
            }),
        });
        const data = await res.json() as { rows: Array<{ balance: string }> };
        const row  = data.rows?.[0];
        if (!row) return 0n;

        // balance: "10.0000 BINGO" → extrai inteiro sem ponto
        const [amount] = row.balance.split(' ');
        if (!amount) return 0n;
        const [whole, frac = ''] = amount.split('.');
        return BigInt(whole + frac);
    } catch {
        return 0n;
    }
}
