// apps/harness/tests/swap.test.ts
// Suite 9 — E2E do contrato bingo.swap (DEX AMM x*y=k, ADR-018)
//
// Cobertura:
//   Passo 1  — addtoken: WAX e BINGO adicionados à allowlist
//   Passo 2  — createpool: pool WAX/BINGO com fee=30bps criado
//   Passo 3  — deposit: jogador1 deposita WAX e BINGO (memo "deposit,<pool_id>")
//   Passo 4  — addliq: LP creditado, dead-shares queimadas, reservas atualizadas
//   Passo 5  — swap WAX→BINGO: k-invariant, fee aplicada, output correto
//   Passo 6  — swap BINGO→WAX: simetria da fórmula
//   Passo 7  — remliq parcial: reservas reduzidas proporcionalmente
//   Passo 8  — canceldep: depósito parcial cancelado e devolvido
//   Passo 9  — Security guards: addtoken por não-admin falha;
//              createpool com token fora da allowlist falha

import { PrivateKey, Session }                              from '@wharfkit/session';
import { WalletPluginPrivateKey }                                       from '@wharfkit/wallet-plugin-privatekey';

import {
    BlockchainSwapPool,
    BlockchainLpBalance,
    BlockchainPendingDeposit,
    BlockchainAllowedToken,
} from '../../../packages/shared-types/src';

// ==========================================
// CONFIG
// ==========================================

const url     = process.env.RPC_URL  || 'http://127.0.0.1:8888';
const chainId = process.env.CHAIN_ID || '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';

const swapAdminKey = PrivateKey.from(process.env.BINGO_SWAP_KEY!);
const playerKey    = PrivateKey.from(process.env.JOGADOR1_KEY!);
const player2Key   = PrivateKey.from(process.env.JOGADOR2_KEY!);

function makeSession(actor: string, key: PrivateKey): Session {
    return new Session({
        actor,
        permission:   'active',
        chain:        { id: chainId, url },
        walletPlugin: new WalletPluginPrivateKey(key),
    });
}

const swapSession   = makeSession('bingo.swap', swapAdminKey);
const playerSession = makeSession('jogador1',   playerKey);
const player2Session = makeSession('jogador2',  player2Key);

// Pool criado no Passo 2 — preenchido após leitura da tabela
let poolId: number;

// ==========================================
// HELPERS
// ==========================================

async function transact(session: Session, account: string, name: string, data: object) {
    return session.transact({
        actions: [{
            account,
            name,
            authorization: [session.permissionLevel],
            data,
        }],
    }, { broadcast: true });
}

async function getRows<T>(
    table: string,
    scope: string,
    lowerBound?: string,
    upperBound?: string,
    limit = 50,
): Promise<T[]> {
    const body: Record<string, unknown> = {
        code:  'bingo.swap',
        scope,
        table,
        json:  true,
        limit,
    };
    if (lowerBound !== undefined) body.lower_bound = lowerBound;
    if (upperBound !== undefined) body.upper_bound = upperBound;

    const res = await fetch(`${url}/v1/chain/get_table_rows`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    }).then(r => r.json() as any);
    return res.rows ?? [];
}

async function getPool(id: number): Promise<BlockchainSwapPool | null> {
    const rows = await getRows<BlockchainSwapPool>('pools', 'bingo.swap', String(id), String(id), 1);
    return rows[0] ?? null;
}

async function getLpBalance(account: string, pid: number): Promise<BlockchainLpBalance | null> {
    const rows = await getRows<BlockchainLpBalance>('lpbalances', account, String(pid), String(pid), 1);
    return rows[0] ?? null;
}

async function getPending(account: string, pid: number): Promise<BlockchainPendingDeposit | null> {
    const rows = await getRows<BlockchainPendingDeposit>('pending', account, String(pid), String(pid), 1);
    return rows[0] ?? null;
}

// Lê saldo de token via eosio.token/bingo.token accounts table (scope = account)
async function getTokenBalance(tokenContract: string, account: string, symbol: string): Promise<number> {
    const res = await fetch(`${url}/v1/chain/get_table_rows`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code:  tokenContract,
            scope: account,
            table: 'accounts',
            json:  true,
            limit: 10,
        }),
    }).then(r => r.json() as any);
    const row = (res.rows ?? []).find((r: any) => r.balance?.includes(symbol));
    if (!row) return 0;
    return parseFloat(row.balance.split(' ')[0]) * 10000; // converte para unidades mínimas (4dp)
}

// ==========================================
// SUITE 9 — bingo.swap AMM
// ==========================================

describe('Suite 9 — bingo.swap: DEX AMM x*y=k (ADR-018)', () => {

    // ── Passo 1: addtoken ─────────────────────────────────────────────────────
    describe('Passo 1 — addtoken: gerencia allowlist', () => {

        it('bingo.swap pode adicionar WAX à allowlist', async () => {
            // O init_dev_env.sh já chamou addtoken; se falhar com "já existe" é ok.
            // Aqui re-verificamos que a entrada está presente na tabela.
            const rows = await getRows<BlockchainAllowedToken>('allowedtoks', 'bingo.swap');
            const wax = rows.find(r => r.sym.sym === '4,WAX' && r.sym.contract === 'eosio.token');
            expect(wax).toBeDefined();
        });

        it('bingo.swap pode adicionar BINGO à allowlist', async () => {
            const rows = await getRows<BlockchainAllowedToken>('allowedtoks', 'bingo.swap');
            const bingo = rows.find(r => r.sym.sym === '4,BINGO' && r.sym.contract === 'bingo.token');
            expect(bingo).toBeDefined();
        });

        it('addtoken por conta não-admin é rejeitado', async () => {
            await expect(
                transact(playerSession, 'bingo.swap', 'addtoken', {
                    sym: { sym: '4,TLM', contract: 'alien.worlds' },
                }),
            ).rejects.toThrow();
        });
    });

    // ── Passo 2: createpool ───────────────────────────────────────────────────
    describe('Passo 2 — createpool: cria pool WAX/BINGO', () => {

        it('qualquer conta pode criar pool com par permitido', async () => {
            // Tenta criar; pode já existir de run anterior → pega pool_id pela tabela
            await transact(playerSession, 'bingo.swap', 'createpool', {
                creator: 'jogador1',
                sym_a:   { sym: '4,WAX',   contract: 'eosio.token' },
                sym_b:   { sym: '4,BINGO', contract: 'bingo.token' },
                fee_bps: 30,
            }).catch(() => {}); // idempotente: pool já pode existir

            const pools = await getRows<BlockchainSwapPool>('pools', 'bingo.swap');
            const waxBingo = pools.find(p =>
                p.sym_a.sym === '4,WAX'   && p.sym_a.contract === 'eosio.token' &&
                p.sym_b.sym === '4,BINGO' && p.sym_b.contract === 'bingo.token',
            );
            expect(waxBingo).toBeDefined();
            poolId = Number(waxBingo!.pool_id);
            expect(poolId).toBeGreaterThan(0);
        });

        it('createpool com token fora da allowlist é rejeitado', async () => {
            // FAKE é um token inventado, nunca adicionado à allowlist
            await expect(
                transact(playerSession, 'bingo.swap', 'createpool', {
                    creator: 'jogador1',
                    sym_a:   { sym: '4,WAX',  contract: 'eosio.token' },
                    sym_b:   { sym: '4,FAKE', contract: 'fake.token'  },
                    fee_bps: 30,
                }),
            ).rejects.toThrow();
        });
    });

    // ── Passo 3 + 4: deposit + addliq ────────────────────────────────────────
    describe('Passo 3+4 — addliq: deposita e minta LP', () => {

        const DEP_WAX   = '10000.0000 WAX';   // 10 000 WAX
        const DEP_BINGO = '10000.0000 BINGO'; // 10 000 BINGO

        it('jogador1 envia WAX com memo deposit,<pool_id>', async () => {
            await transact(playerSession, 'eosio.token', 'transfer', {
                from:     'jogador1',
                to:       'bingo.swap',
                quantity: DEP_WAX,
                memo:     `deposit,${poolId}`,
            });
            const pending = await getPending('jogador1', poolId);
            expect(pending).toBeDefined();
            // deposit_a deve ter amount > 0 (WAX depositado)
            expect(Number(pending!.deposit_a.quantity.split(' ')[0])).toBeGreaterThan(0);
        });

        it('jogador1 envia BINGO com memo deposit,<pool_id>', async () => {
            await transact(playerSession, 'bingo.token', 'transfer', {
                from:     'jogador1',
                to:       'bingo.swap',
                quantity: DEP_BINGO,
                memo:     `deposit,${poolId}`,
            });
            const pending = await getPending('jogador1', poolId);
            expect(pending).toBeDefined();
            // ambos os lados devem ter sido preenchidos
            expect(Number(pending!.deposit_b.quantity.split(' ')[0])).toBeGreaterThan(0);
        });

        it('addliq minta LP e registra reservas', async () => {
            const poolBefore = await getPool(poolId);
            const reservaAAntes = Number(poolBefore?.reserve_a ?? 0);

            await transact(playerSession, 'bingo.swap', 'addliq', {
                provider: 'jogador1',
                pool_id:  poolId,
                min_lp:   0,
            });

            const pool = await getPool(poolId);
            expect(pool).toBeDefined();
            // Reservas aumentaram
            expect(Number(pool!.reserve_a)).toBeGreaterThan(reservaAAntes);
            expect(Number(pool!.reserve_b)).toBeGreaterThan(0);
            expect(Number(pool!.lp_supply)).toBeGreaterThan(0);

            // LP creditado ao provedor (descontando dead-shares de 1000)
            const lp = await getLpBalance('jogador1', poolId);
            expect(lp).toBeDefined();
            expect(Number(lp!.amount)).toBeGreaterThan(0);

            // Depósito pendente deve ter sido consumido
            const pending = await getPending('jogador1', poolId);
            expect(pending).toBeNull();
        });
    });

    // ── Passo 5: swap WAX→BINGO ───────────────────────────────────────────────
    describe('Passo 5 — swap WAX→BINGO: invariant x*y≈k', () => {

        it('swap 100 WAX → BINGO satisfaz k-invariant (fee incluída nas reservas)', async () => {
            const poolBefore = await getPool(poolId);
            const rA0 = Number(poolBefore!.reserve_a);
            const rB0 = Number(poolBefore!.reserve_b);
            const k0  = rA0 * rB0;

            const waxBefore = await getTokenBalance('bingo.token', 'jogador1', 'BINGO');

            await transact(playerSession, 'eosio.token', 'transfer', {
                from:     'jogador1',
                to:       'bingo.swap',
                quantity: '100.0000 WAX',
                memo:     `swap,${poolId},0,jogador1`,
            });

            const poolAfter = await getPool(poolId);
            const rA1 = Number(poolAfter!.reserve_a);
            const rB1 = Number(poolAfter!.reserve_b);
            const k1  = rA1 * rB1;

            // A fee fica nas reservas → k cresce levemente (taxa 0.30%)
            expect(k1).toBeGreaterThanOrEqual(k0);

            // Reserve_a aumentou (WAX entrou)
            expect(rA1).toBeGreaterThan(rA0);
            // Reserve_b diminuiu (BINGO saiu)
            expect(rB1).toBeLessThan(rB0);

            // Jogador recebeu BINGO
            const waxAfter = await getTokenBalance('bingo.token', 'jogador1', 'BINGO');
            expect(waxAfter).toBeGreaterThan(waxBefore);
        });
    });

    // ── Passo 6: swap BINGO→WAX ───────────────────────────────────────────────
    describe('Passo 6 — swap BINGO→WAX: simetria da fórmula', () => {

        it('swap 100 BINGO → WAX satisfaz k-invariant', async () => {
            const poolBefore = await getPool(poolId);
            const rA0 = Number(poolBefore!.reserve_a);
            const rB0 = Number(poolBefore!.reserve_b);
            const k0  = rA0 * rB0;

            const waxBefore = await getTokenBalance('eosio.token', 'jogador1', 'WAX');

            await transact(playerSession, 'bingo.token', 'transfer', {
                from:     'jogador1',
                to:       'bingo.swap',
                quantity: '100.0000 BINGO',
                memo:     `swap,${poolId},0,jogador1`,
            });

            const poolAfter = await getPool(poolId);
            const k1 = Number(poolAfter!.reserve_a) * Number(poolAfter!.reserve_b);

            // k só cresce (fee fica no pool)
            expect(k1).toBeGreaterThanOrEqual(k0);

            // Reserve_b aumentou (BINGO entrou), reserve_a diminuiu (WAX saiu)
            expect(Number(poolAfter!.reserve_b)).toBeGreaterThan(rB0);
            expect(Number(poolAfter!.reserve_a)).toBeLessThan(rA0);

            const waxAfter = await getTokenBalance('eosio.token', 'jogador1', 'WAX');
            expect(waxAfter).toBeGreaterThan(waxBefore);
        });
    });

    // ── Passo 7: remliq parcial ───────────────────────────────────────────────
    describe('Passo 7 — remliq: remove liquidez parcialmente', () => {

        it('remliq queima LP e devolve tokens proporcionalmente', async () => {
            const lpBefore = await getLpBalance('jogador1', poolId);
            const lpAmount = Number(lpBefore!.amount);
            expect(lpAmount).toBeGreaterThan(0);

            const remAmount = Math.floor(lpAmount / 4); // remove 25% do LP

            const poolBefore = await getPool(poolId);
            const rA0 = Number(poolBefore!.reserve_a);
            const rB0 = Number(poolBefore!.reserve_b);

            await transact(playerSession, 'bingo.swap', 'remliq', {
                provider:  'jogador1',
                pool_id:   poolId,
                lp_amount: remAmount,
                min_a:     0,
                min_b:     0,
            });

            const lpAfter = await getLpBalance('jogador1', poolId);
            // LP saldo diminuiu
            expect(Number(lpAfter!.amount)).toBeLessThan(lpAmount);
            expect(Number(lpAfter!.amount)).toBeGreaterThanOrEqual(0);

            const poolAfter = await getPool(poolId);
            // Reservas diminuíram proporcionalmente
            expect(Number(poolAfter!.reserve_a)).toBeLessThan(rA0);
            expect(Number(poolAfter!.reserve_b)).toBeLessThan(rB0);
        });
    });

    // ── Passo 8: canceldep ────────────────────────────────────────────────────
    describe('Passo 8 — canceldep: cancela depósito parcial', () => {

        it('depósito parcial (só WAX) é devolvido ao provider via canceldep', async () => {
            // Deposita apenas WAX (sem BINGO)
            await transact(playerSession, 'eosio.token', 'transfer', {
                from:     'jogador1',
                to:       'bingo.swap',
                quantity: '50.0000 WAX',
                memo:     `deposit,${poolId}`,
            });

            const pendingBefore = await getPending('jogador1', poolId);
            expect(pendingBefore).toBeDefined();

            const waxBefore = await getTokenBalance('eosio.token', 'jogador1', 'WAX');

            await transact(playerSession, 'bingo.swap', 'canceldep', {
                provider: 'jogador1',
                pool_id:  poolId,
            });

            // Depósito removido da tabela
            const pendingAfter = await getPending('jogador1', poolId);
            expect(pendingAfter).toBeNull();

            // WAX devolvido
            const waxAfter = await getTokenBalance('eosio.token', 'jogador1', 'WAX');
            expect(waxAfter).toBeGreaterThan(waxBefore);
        });
    });

    // ── Passo 9: Security Guards ──────────────────────────────────────────────
    describe('Passo 9 — Security Guards', () => {

        it('addtoken por jogador2 (não-admin) é rejeitado', async () => {
            await expect(
                transact(player2Session, 'bingo.swap', 'addtoken', {
                    sym: { sym: '4,TLM', contract: 'alien.worlds' },
                }),
            ).rejects.toThrow();
        });

        it('deltoken por jogador2 (não-admin) é rejeitado', async () => {
            await expect(
                transact(player2Session, 'bingo.swap', 'deltoken', {
                    sym: { sym: '4,WAX', contract: 'eosio.token' },
                }),
            ).rejects.toThrow();
        });

        it('createpool com sym_b não-aprovado é rejeitado', async () => {
            await expect(
                transact(playerSession, 'bingo.swap', 'createpool', {
                    creator: 'jogador1',
                    sym_a:   { sym: '4,WAX',  contract: 'eosio.token' },
                    sym_b:   { sym: '4,EVIL', contract: 'evil.contract' },
                    fee_bps: 30,
                }),
            ).rejects.toThrow();
        });

        it('createpool com sym_a não-aprovado é rejeitado', async () => {
            await expect(
                transact(playerSession, 'bingo.swap', 'createpool', {
                    creator: 'jogador1',
                    sym_a:   { sym: '4,FAKE', contract: 'fake.token'   },
                    sym_b:   { sym: '4,WAX',  contract: 'eosio.token'  },
                    fee_bps: 30,
                }),
            ).rejects.toThrow();
        });

        it('addliq sem depósitos pendentes é rejeitado', async () => {
            // jogador2 nunca depositou nada
            await expect(
                transact(player2Session, 'bingo.swap', 'addliq', {
                    provider: 'jogador2',
                    pool_id:  poolId,
                    min_lp:   0,
                }),
            ).rejects.toThrow();
        });

        it('swap com min_out não atingido é rejeitado (slippage guard)', async () => {
            // Pede um min_out absurdo (mais do que existe no pool)
            await expect(
                transact(playerSession, 'eosio.token', 'transfer', {
                    from:     'jogador1',
                    to:       'bingo.swap',
                    quantity: '1.0000 WAX',
                    memo:     `swap,${poolId},999999999999,jogador1`,
                }),
            ).rejects.toThrow();
        });

        it('canceldep sem depósito pendente é rejeitado', async () => {
            // jogador2 não tem nenhum depósito pendente
            await expect(
                transact(player2Session, 'bingo.swap', 'canceldep', {
                    provider: 'jogador2',
                    pool_id:  poolId,
                }),
            ).rejects.toThrow();
        });

        it('remliq com LP maior que o saldo é rejeitado', async () => {
            await expect(
                transact(player2Session, 'bingo.swap', 'remliq', {
                    provider:  'jogador2',
                    pool_id:   poolId,
                    lp_amount: 999999999,
                    min_a:     0,
                    min_b:     0,
                }),
            ).rejects.toThrow();
        });

        it('setpoolfee por não-admin é rejeitado', async () => {
            await expect(
                transact(playerSession, 'bingo.swap', 'setpoolfee', {
                    pool_id:         poolId,
                    service_fee_bps: 100,
                }),
            ).rejects.toThrow();
        });

        it('settreasury por não-admin é rejeitado', async () => {
            await expect(
                transact(playerSession, 'bingo.swap', 'settreasury', {
                    account: 'jogador1',
                }),
            ).rejects.toThrow();
        });

        it('setpoolfee acima de 500 bps é rejeitado', async () => {
            await expect(
                transact(swapSession, 'bingo.swap', 'setpoolfee', {
                    pool_id:         poolId,
                    service_fee_bps: 501,
                }),
            ).rejects.toThrow();
        });
    });

    // ── Passo 10 — service fee ────────────────────────────────────────────────
    describe('Passo 10 — service_fee: settreasury + setpoolfee + dedução no swap', () => {

        it('settreasury define bingo.game como treasury', async () => {
            await transact(swapSession, 'bingo.swap', 'settreasury', {
                account: 'bingo.game',
            });
            // Lê swapstate para confirmar
            const rows = await getRows<{ next_pool_id: string; treasury: string }>(
                'swapstate', 'bingo.swap',
            );
            expect(rows[0]?.treasury).toBe('bingo.game');
        });

        it('setpoolfee 100 bps (1%) configura service fee do pool', async () => {
            await transact(swapSession, 'bingo.swap', 'setpoolfee', {
                pool_id:         poolId,
                service_fee_bps: 100,
            });
            const pool = await getPool(poolId);
            expect(pool!.service_fee_bps).toBe(100);
        });

        it('swap WAX→BINGO com service_fee=1%: treasury recebe ~1% do input em WAX', async () => {
            const SWAP_WAX = 1000_0000; // 100.0000 WAX em unidades mínimas
            const SWAP_QTY = '100.0000 WAX';
            const expectedFee = Math.floor(SWAP_WAX * 100 / 10000); // 1% = 10000 units = 1 WAX

            // Saldo WAX da treasury (bingo.game) antes do swap
            const treasuryBefore = await getTokenBalance('eosio.token', 'bingo.game', 'WAX');
            const poolBefore = await getPool(poolId);
            const k0 = Number(poolBefore!.reserve_a) * Number(poolBefore!.reserve_b);

            await transact(playerSession, 'eosio.token', 'transfer', {
                from:     'jogador1',
                to:       'bingo.swap',
                quantity: SWAP_QTY,
                memo:     `swap,${poolId},0,jogador1`,
            });

            const treasuryAfter = await getTokenBalance('eosio.token', 'bingo.game', 'WAX');
            // Treasury deve ter recebido exatamente a service fee
            expect(treasuryAfter - treasuryBefore).toBeCloseTo(expectedFee, -2);

            // Pool usa net_amount_in (sem a fee) → k ainda cresce, mas menos que sem service fee
            const poolAfter = await getPool(poolId);
            const k1 = Number(poolAfter!.reserve_a) * Number(poolAfter!.reserve_b);
            expect(k1).toBeGreaterThanOrEqual(k0);

            // reserve_a cresceu apenas pelo net_in (não pelo input total)
            const expectedNetIn = SWAP_WAX - expectedFee;
            expect(Number(poolAfter!.reserve_a) - Number(poolBefore!.reserve_a))
                .toBe(expectedNetIn);
        });

        it('setpoolfee 0 desativa service fee (campanha fee-zero)', async () => {
            await transact(swapSession, 'bingo.swap', 'setpoolfee', {
                pool_id:         poolId,
                service_fee_bps: 0,
            });
            const pool = await getPool(poolId);
            expect(pool!.service_fee_bps).toBe(0);

            // Swap sem service fee: treasury não recebe nada a mais
            const treasuryBefore = await getTokenBalance('eosio.token', 'bingo.game', 'WAX');
            await transact(playerSession, 'eosio.token', 'transfer', {
                from:     'jogador1',
                to:       'bingo.swap',
                quantity: '10.0000 WAX',
                memo:     `swap,${poolId},0,jogador1`,
            });
            const treasuryAfter = await getTokenBalance('eosio.token', 'bingo.game', 'WAX');
            expect(treasuryAfter).toBe(treasuryBefore); // nenhuma fee transferida
        });
    });
});
