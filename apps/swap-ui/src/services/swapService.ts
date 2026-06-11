// apps/swap-ui/src/services/swapService.ts
// ADR-022 — bingogameswp DEX público.
// Superset do swapService do frontend: inclui cotações + liqidez (addliq/remliq/canceldep).
// A execução é sempre on-chain via Wharfkit — sem custódia de chaves aqui.

import type { SwapQuote, SwapPoolSummary } from '@cryptobingo/shared-types';
import type { Session } from '@wharfkit/session';
import { Asset, Name } from '@wharfkit/session';

const API_BASE = (import.meta.env.VITE_API_GATEWAY_URL ?? 'http://localhost:3000') + '/api/v1';
const RPC_URL  = import.meta.env.VITE_WAX_RPC_URL ?? 'http://127.0.0.1:8888';
const SWAP_ACCOUNT = import.meta.env.VITE_SWAP_CONTRACT ?? 'bingogameswp';

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────
// Leitura — pools e cotações
// ─────────────────────────────────────────────

/** Lista pools ativas (cache 10s no API-gateway). */
export async function fetchSwapPools(): Promise<SwapPoolSummary[]> {
    const res = await fetch(`${API_BASE}/swap/pools`);
    const data = await handleResponse<{ pools: SwapPoolSummary[] }>(res);
    return data.pools;
}

export interface QuoteParams {
    fromContract: string;
    fromSymbol:   string;
    toContract:   string;
    toSymbol:     string;
    amountOut:    string;
}

/** Cotação reversa: quanto pagar em fromToken para receber amountOut exato de toToken. */
export async function fetchSwapQuote(params: QuoteParams): Promise<SwapQuote> {
    const qs = new URLSearchParams({
        from_contract: params.fromContract,
        from_symbol:   params.fromSymbol,
        to_contract:   params.toContract,
        to_symbol:     params.toSymbol,
        amount_out:    params.amountOut,
    });
    const res = await fetch(`${API_BASE}/swap/quote?${qs}`);
    return handleResponse<SwapQuote>(res);
}

// ─────────────────────────────────────────────
// Leitura on-chain — saldos e posições LP
// ─────────────────────────────────────────────

/** Saldo de um token na carteira do usuário (leitura direta no nodeos). */
export async function fetchTokenBalance(
    account:       string,
    tokenContract: string,
    symbolCode:    string,
): Promise<bigint> {
    try {
        const res = await fetch(`${RPC_URL}/v1/chain/get_table_rows`, {
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
        const [amount] = row.balance.split(' ');
        if (!amount) return 0n;
        const [whole, frac = ''] = amount.split('.');
        return BigInt(whole + frac);
    } catch {
        return 0n;
    }
}

export interface LpPosition {
    pool_id:   number;
    lp_amount: bigint;    // unidades mínimas do token LP
    lp_symbol: string;    // ex: "4,BINLP1"
}

export interface PendingDeposit {
    pool_id:    number;
    depositor:  string;
    amount_a:   string;
    amount_b:   string;
}

/** Posições LP do usuário (tabela `lppositions` do bingogameswp). */
export async function fetchUserLpPositions(account: string): Promise<LpPosition[]> {
    try {
        const res = await fetch(`${RPC_URL}/v1/chain/get_table_rows`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                code:        SWAP_ACCOUNT,
                scope:       account,
                table:       'lppositions',
                json:        true,
                limit:       50,
            }),
        });
        const data = await res.json() as { rows: Array<{ pool_id: number; lp_amount: string }> };
        return (data.rows ?? []).map(r => {
            const [amount, sym] = r.lp_amount.split(' ');
            const [whole, frac = ''] = amount.split('.');
            return {
                pool_id:   r.pool_id,
                lp_amount: BigInt(whole + frac),
                lp_symbol: sym,
            };
        });
    } catch {
        return [];
    }
}

/** Depósitos pendentes do usuário (aguardando addliquidity). */
export async function fetchPendingDeposits(account: string): Promise<PendingDeposit[]> {
    try {
        const res = await fetch(`${RPC_URL}/v1/chain/get_table_rows`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                code:        SWAP_ACCOUNT,
                scope:       SWAP_ACCOUNT,
                table:       'pendingdeps',
                json:        true,
                limit:       50,
                lower_bound: account,
                upper_bound: account,
                index_position: 2,
                key_type:    'name',
            }),
        });
        const data = await res.json() as {
            rows: Array<{ pool_id: number; depositor: string; amount_a: string; amount_b: string }>;
        };
        return data.rows ?? [];
    } catch {
        return [];
    }
}

// ─────────────────────────────────────────────
// Execução on-chain (Wharfkit)
// ─────────────────────────────────────────────

export interface SwapParams {
    fromContract: string;
    amountIn:     string;   // ex: "5.0000 BINGO"
    minOut:       string;   // ex: "2.4975 WAX"  (0.5% slippage)
    poolId:       number;
    toContract:   string;
}

/** Executa swap via transfer para bingogameswp com memo "swap,{pool_id},{min_out},{actor}". */
export async function executeSwap(session: Session, params: SwapParams): Promise<void> {
    const actor = String(session.actor);
    const memo  = `swap,${params.poolId},${params.minOut},${actor}`;
    await session.transact({
        actions: [{
            account:       Name.from(params.fromContract),
            name:          Name.from('transfer'),
            authorization: [session.permissionLevel],
            data:          {
                from:     actor,
                to:       SWAP_ACCOUNT,
                quantity: Asset.from(params.amountIn),
                memo,
            },
        }],
    });
}

export interface AddLiquidityParams {
    poolId:        number;
    amountA:       string;   // ex: "10.0000 BINGO"
    contractA:     string;
    amountB:       string;   // ex: "5.00000000 WAX"
    contractB:     string;
}

/**
 * Adiciona liquidez em 2 passos:
 *  1. transfer tokenA → bingogameswp com memo "deposit,{pool_id}"
 *  2. transfer tokenB → bingogameswp com memo "deposit,{pool_id}"
 * Após os 2 depósitos, a posição LP é creditada ao usuário.
 */
export async function executeAddLiquidity(
    session: Session,
    params:  AddLiquidityParams,
): Promise<void> {
    const actor = String(session.actor);
    const memo  = `deposit,${params.poolId}`;
    await session.transact({
        actions: [
            {
                account:       Name.from(params.contractA),
                name:          Name.from('transfer'),
                authorization: [session.permissionLevel],
                data:          { from: actor, to: SWAP_ACCOUNT, quantity: Asset.from(params.amountA), memo },
            },
            {
                account:       Name.from(params.contractB),
                name:          Name.from('transfer'),
                authorization: [session.permissionLevel],
                data:          { from: actor, to: SWAP_ACCOUNT, quantity: Asset.from(params.amountB), memo },
            },
        ],
    });
}

export interface RemoveLiquidityParams {
    poolId:     number;
    lpSymbol:   string;   // ex: "BINLP1"
    lpPrecision: number;
    pctBps:     number;   // 0–10000 (10000 = 100%)
    lpAmount:   bigint;
}

/** Remove liquidez: envia fração do LP token para bingogameswp com memo "remliq,{pool_id}". */
export async function executeRemoveLiquidity(
    session: Session,
    params:  RemoveLiquidityParams,
): Promise<void> {
    const actor     = String(session.actor);
    const toRemove  = (params.lpAmount * BigInt(params.pctBps) + 9999n) / 10000n;
    const fracLen   = params.lpPrecision;
    const whole     = (toRemove / BigInt(10 ** fracLen)).toString();
    const frac      = (toRemove % BigInt(10 ** fracLen)).toString().padStart(fracLen, '0');
    const quantity  = `${whole}.${frac} ${params.lpSymbol}`;
    await session.transact({
        actions: [{
            account:       Name.from(SWAP_ACCOUNT),
            name:          Name.from('transfer'),
            authorization: [session.permissionLevel],
            data:          {
                from:     actor,
                to:       SWAP_ACCOUNT,
                quantity: Asset.from(quantity),
                memo:     `remliq,${params.poolId}`,
            },
        }],
    });
}

/** Cancela depósito pendente (devolve os tokens para o depositor). */
export async function executeCancelDeposit(session: Session, poolId: number): Promise<void> {
    await session.transact({
        actions: [{
            account:       Name.from(SWAP_ACCOUNT),
            name:          Name.from('canceldep'),
            authorization: [session.permissionLevel],
            data:          { depositor: String(session.actor), pool_id: poolId },
        }],
    });
}
