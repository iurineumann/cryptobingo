// apps/api-gateway/src/controllers/swapController.ts
// ADR-021 — Checkout Multi-Moeda via bingogameswp
//
// Endpoints somente-leitura: lêem o estado on-chain do bingogameswp e
// calculam cotações (reverse AMM). Nenhuma chave privada é usada aqui —
// a transação é construída e assinada pelo cliente via Wharfkit.

import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { rpcClient } from '@cryptobingo/blockchain-core';
import { redisClient } from '../database/redis';
import type { SwapQuote, SwapPoolSummary } from '@cryptobingo/shared-types';
import { logger } from '../middleware/logger';
import { getRequestId } from '../middleware/requestId';

const SWAP_CONTRACT   = process.env.SWAP_CONTRACT  || 'bingogameswp';
const RPC_ENDPOINT    = process.env.RPC_URL  || 'http://127.0.0.1:8888';
const POOLS_CACHE_TTL = 10; // segundos — pools mudam raramente
const QUOTE_TTL_MAX   = 30; // segundos — cotação máxima antes de expirar

// ── helpers de AMM ────────────────────────────────────────────────────────────

/**
 * Dada a quantidade de saída desejada, calcula quanto o usuário precisa enviar.
 * Reverse AMM: resolve amount_in da fórmula x*y=k com dedução de fee dupla.
 *
 * Fórmula:
 *   net_amount_in  = ceil((reserve_in × amount_out × 10000)
 *                         / ((reserve_out - amount_out) × (10000 - fee_bps)))
 *   amount_in      = ceil(net_amount_in × 10000 / (10000 - service_fee_bps))
 *
 * Retorna -1 se amount_out >= reserve_out (pool sem liquidez suficiente).
 */
function computeAmountIn(
    reserveIn:      bigint,
    reserveOut:     bigint,
    amountOut:      bigint,
    feeBps:         number,
    serviceFeeBps:  number,
): bigint {
    if (amountOut >= reserveOut) return -1n;

    const denominator = (reserveOut - amountOut) * BigInt(10000 - feeBps);
    if (denominator === 0n) return -1n;

    const netAmountIn = (reserveIn * amountOut * 10000n + denominator - 1n) / denominator;

    if (serviceFeeBps === 0) return netAmountIn;

    const divisor = BigInt(10000 - serviceFeeBps);
    return (netAmountIn * 10000n + divisor - 1n) / divisor;
}

/**
 * Impacto no pool em % causado pelo swap.
 * price_impact = amount_out / reserve_out × 100
 */
function priceImpact(amountOut: bigint, reserveOut: bigint): number {
    if (reserveOut === 0n) return 100;
    return Number((amountOut * 10000n) / reserveOut) / 100;
}

/** Formata unidades mínimas para display legível, ex: 10_0000 → "10.0000 BINGO" */
function formatAmount(units: bigint, precision: number, symbol: string): string {
    const factor = 10n ** BigInt(precision);
    const whole  = units / factor;
    const frac   = (units % factor).toString().padStart(precision, '0');
    return `${whole}.${frac} ${symbol}`;
}

/** Extrai precisão de um símbolo no formato "4,BINGO" → 4 */
function parsePrecision(sym: string): number {
    return parseInt(sym.split(',')[0] ?? '4', 10);
}

/** Extrai o código do símbolo: "4,BINGO" → "BINGO" */
function parseSymbolCode(sym: string): string {
    return sym.split(',')[1] ?? sym;
}

// ── leitura on-chain ──────────────────────────────────────────────────────────

interface RawPool {
    pool_id:         string;
    sym_a:           { sym: string; contract: string };
    sym_b:           { sym: string; contract: string };
    reserve_a:       string;
    reserve_b:       string;
    lp_supply:       string;
    fee_bps:         number;
    service_fee_bps: number;
}

async function fetchPools(): Promise<RawPool[]> {
    const cacheKey = `swap:pools`;
    try {
        const cached = await redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached) as RawPool[];
    } catch {
        // Redis indisponível — continua sem cache
    }

    try {
        const res = await rpcClient.v1.chain.get_table_rows({
            code:       SWAP_CONTRACT,
            scope:      SWAP_CONTRACT,
            table:      'pools',
            json:       true,
            limit:      100,
        });

        const pools = (res.rows ?? []) as RawPool[];

        try {
            await redisClient.set(cacheKey, JSON.stringify(pools), { EX: POOLS_CACHE_TTL });
        } catch {
            // silencia falha de cache write
        }

        return pools;
    } catch (err) {
        // Degradação graceful: se o contrato de swap não está deployado na
        // testnet (tabela 'pools' ausente) ou o RPC falha, retorna lista vazia
        // em vez de 502. Em produção (contrato deployado) o fluxo é normal.
        logger.warn({ err: err, tag: 'swapController' }, 'fetchPools: contrato de swap indisponível, retornando []');
        return [];
    }
}

// ── leitura de NFT discounts ───────────────────────────────────────────────────

interface RawNftDiscount {
    template_id:  number;
    discount_bps: number;
}

async function fetchNftDiscounts(): Promise<RawNftDiscount[]> {
    const cacheKey = `swap:nftdiscounts`;
    try {
        const cached = await redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached) as RawNftDiscount[];
    } catch { /* ok */ }

    try {
        const res = await rpcClient.v1.chain.get_table_rows({
            code:  SWAP_CONTRACT,
            scope: SWAP_CONTRACT,
            table: 'nftdiscounts',
            json:  true,
            limit: 100,
        });

        const discounts = (res.rows ?? []) as RawNftDiscount[];

        try {
            await redisClient.set(cacheKey, JSON.stringify(discounts), { EX: 60 });
        } catch { /* ok */ }

        return discounts;
    } catch (err) {
        logger.warn({ err: err, tag: 'swapController' }, 'fetchNftDiscounts: contrato de swap indisponível, retornando []');
        return [];
    }
}

/**
 * GET /api/v1/swap/nft-discounts
 * Lista descontos na service_fee por template_id de NFT. Cache 60s.
 */
export async function listNftDiscounts(req: Request, res: Response): Promise<void> {
    try {
        const discounts = await fetchNftDiscounts();
        res.json({ discounts });
    } catch (err) {
        logger.error({ err: err, tag: 'swapController' }, 'listNftDiscounts');
        res.status(502).json({ error: 'Falha ao ler nftdiscounts do bingogameswp' });
    }
}

// ── endpoints ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/swap/pools
 * Lista pools ativas do bingogameswp. Cache de 10s no Redis.
 */
export async function listSwapPools(req: Request, res: Response): Promise<void> {
    try {
        const pools = await fetchPools();

        const summaries: SwapPoolSummary[] = pools.map(p => ({
            pool_id:         p.pool_id,
            token_a:         {
                contract:  p.sym_a.contract,
                symbol:    parseSymbolCode(p.sym_a.sym),
                precision: parsePrecision(p.sym_a.sym),
            },
            token_b:         {
                contract:  p.sym_b.contract,
                symbol:    parseSymbolCode(p.sym_b.sym),
                precision: parsePrecision(p.sym_b.sym),
            },
            reserve_a:       p.reserve_a,
            reserve_b:       p.reserve_b,
            fee_bps:         p.fee_bps,
            service_fee_bps: p.service_fee_bps,
        }));

        res.json({ pools: summaries });
    } catch (err) {
        logger.error({ err: err, tag: 'swapController' }, 'listSwapPools');
        res.status(502).json({ error: 'Falha ao ler pools do bingogameswp' });
    }
}

/**
 * GET /api/v1/swap/quote
 *
 * Query params:
 *   from_contract  — ex: "bingogametkn"
 *   from_symbol    — ex: "4,BINGO"
 *   to_contract    — ex: "eosio.token"
 *   to_symbol      — ex: "8,WAX"
 *   amount_out     — unidades mínimas do token de destino (custo total da cartela)
 *   game_end_time? — Unix timestamp (seconds); usado para limitar TTL da cotação
 *   wallet?        — conta WAX do usuário; se informada, verifica NFT discount (ADR-019 Phase 2)
 */
export async function getSwapQuote(req: Request, res: Response): Promise<void> {
    const { from_contract, from_symbol, to_contract, to_symbol, amount_out, game_end_time, wallet } = req.query;

    if (!from_contract || !from_symbol || !to_contract || !to_symbol || !amount_out) {
        res.status(400).json({ error: 'Parâmetros obrigatórios: from_contract, from_symbol, to_contract, to_symbol, amount_out' });
        return;
    }

    const amountOutUnits = BigInt(amount_out as string);
    if (amountOutUnits <= 0n) {
        res.status(400).json({ error: 'amount_out deve ser positivo' });
        return;
    }

    try {
        const pools = await fetchPools();

        // Busca o pool que corresponde ao par from→to (em qualquer ordem canônica)
        const fromSym   = (from_symbol as string).trim();
        const toSym     = (to_symbol as string).trim();
        const fromCode  = parseSymbolCode(fromSym);
        const toCode    = parseSymbolCode(toSym);
        const fromCtr   = (from_contract as string).trim();
        const toCtr     = (to_contract as string).trim();

        const pool = pools.find(p => {
            const aCode = parseSymbolCode(p.sym_a.sym);
            const bCode = parseSymbolCode(p.sym_b.sym);
            return (
                (aCode === fromCode && p.sym_a.contract === fromCtr && bCode === toCode && p.sym_b.contract === toCtr) ||
                (bCode === fromCode && p.sym_b.contract === fromCtr && aCode === toCode && p.sym_a.contract === toCtr)
            );
        });

        if (!pool) {
            res.status(404).json({ error: `Pool não encontrado para o par ${fromCode}/${toCode}` });
            return;
        }

        // Determina qual é reserve_in e reserve_out com base na ordem do par
        const isFromA = parseSymbolCode(pool.sym_a.sym) === fromCode && pool.sym_a.contract === fromCtr;
        const reserveIn  = BigInt(isFromA ? pool.reserve_a : pool.reserve_b);
        const reserveOut = BigInt(isFromA ? pool.reserve_b : pool.reserve_a);

        if (reserveIn <= 0n || reserveOut <= 0n) {
            res.status(422).json({ error: 'Pool sem liquidez' });
            return;
        }

        // ADR-019 Phase 2: se wallet informada, verifica NFT discount
        let effectiveServiceFeeBps = pool.service_fee_bps;
        let nftDiscountBps = 0;
        if (wallet && pool.service_fee_bps > 0) {
            const discounts = await fetchNftDiscounts();
            // Busca maior discount_bps que o usuário possui via AtomicAssets
            for (const d of discounts) {
                try {
                    const key = String((d.template_id << 0) >>> 0);
                    const rpcRes = await fetch(`${RPC_ENDPOINT}/v1/chain/get_table_rows`, {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({
                            code:           'atomicassets',
                            scope:          (wallet as string).trim(),
                            table:          'assets',
                            lower_bound:    key,
                            upper_bound:    key,
                            index_position: 5,
                            key_type:       'i64',
                            limit:          1,
                            json:           true,
                        }),
                    });
                    const aaRes = await rpcRes.json() as { rows: unknown[] };
                    if ((aaRes.rows ?? []).length > 0 && d.discount_bps > nftDiscountBps) {
                        nftDiscountBps = d.discount_bps;
                    }
                } catch { /* silencia — wallet pode não ter assets */ }
            }
            if (nftDiscountBps > 0) {
                effectiveServiceFeeBps = Math.floor(pool.service_fee_bps * (10000 - nftDiscountBps) / 10000);
            }
        }

        const amountIn = computeAmountIn(reserveIn, reserveOut, amountOutUnits, pool.fee_bps, effectiveServiceFeeBps);

        if (amountIn < 0n) {
            res.status(422).json({ error: 'Liquidez insuficiente para este volume' });
            return;
        }

        // min_out com 0.5% de margem (arredondado para baixo — protege o usuário)
        const minOut = (amountOutUnits * 9950n) / 10000n;

        const impact = priceImpact(amountOutUnits, reserveOut);

        // TTL da cotação: min(QUOTE_TTL_MAX, janela de funding restante - 5s)
        const nowSec     = Math.floor(Date.now() / 1000);
        let ttlSec       = QUOTE_TTL_MAX;
        if (game_end_time) {
            const endTime = parseInt(game_end_time as string, 10);
            if (!isNaN(endTime) && endTime > nowSec) {
                ttlSec = Math.min(QUOTE_TTL_MAX, endTime - nowSec - 5);
            }
        }
        ttlSec = Math.max(ttlSec, 5); // mínimo 5s

        const fromPrec     = parsePrecision(fromSym);
        const fromSymCode  = parseSymbolCode(fromSym);
        const toPrec       = parsePrecision(toSym);
        const toSymCode    = parseSymbolCode(toSym);

        const quote: SwapQuote = {
            quote_id:           randomUUID(),
            pool_id:            pool.pool_id,
            from_contract:      fromCtr,
            from_symbol:        fromSym,
            to_contract:        toCtr,
            to_symbol:          toSym,
            amount_in:          amountIn.toString(),
            amount_in_display:  formatAmount(amountIn, fromPrec, fromSymCode),
            amount_out:         amountOutUnits.toString(),
            amount_out_display: formatAmount(amountOutUnits, toPrec, toSymCode),
            min_out:            minOut.toString(),
            fee_bps:                    pool.fee_bps,
            service_fee_bps:            pool.service_fee_bps,
            effective_service_fee_bps:  effectiveServiceFeeBps,
            nft_discount_bps:           nftDiscountBps,
            price_impact_pct:           impact,
            expires_at:         nowSec + ttlSec,
        };

        res.json(quote);
    } catch (err) {
        logger.error({ err: err, tag: 'swapController' }, 'getSwapQuote');
        res.status(502).json({ error: 'Falha ao calcular cotação' });
    }
}
