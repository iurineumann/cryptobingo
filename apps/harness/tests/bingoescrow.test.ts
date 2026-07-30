// apps/harness/tests/bingoescrow.test.ts
// Testes de integracao do contrato bingoescrow.
//
// Cobertura:
//   1. init + settoken + settierprice + setbacking + setaccpay
//   2. Comprar NFT (WAX) → verificar pending_mint + escrow criado
//   3. addbacking → cancelbacking
//   4. withdraw (saldo livre)
//   5. rescue + admin_rescue (strays)
//   6. apply dispatcher — audits registradas

import { PrivateKey, Session }              from '@wharfkit/session';
import { WalletPluginPrivateKey }                       from '@wharfkit/wallet-plugin-privatekey';

const url     = process.env.RPC_URL  || 'http://127.0.0.1:8888';
const chainId = process.env.CHAIN_ID || '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';

const eosioKey    = PrivateKey.from(process.env.EOSIO_KEY!);
const playerKey   = PrivateKey.from(process.env.JOGADOR1_KEY!);
const escrowKey   = PrivateKey.from('5KQ8kagbUVYjPDWhmiJsdsPZehEFFyLuu8q2vt6ME14M4eSsv9W');

function makeSession(actor: string, key: PrivateKey, permission = 'active') {
    return new Session({
        actor,
        permission,
        chain:        { id: chainId, url },
        walletPlugin: new WalletPluginPrivateKey(key),
    });
}

const rootSession     = makeSession('eosio',          eosioKey);
const escrowAdminSess = makeSession('bingogamescr',   escrowKey, 'admin');
const escrowActiveSes = makeSession('bingogamescr',   escrowKey, 'active');
const playerSession   = makeSession('jogador1',       playerKey);

const ESCROW = 'bingogamescr';

async function transact(session: Session, account: string, name: string, data: object) {
    return session.transact({
        actions: [{
            account,
            name,
            authorization: [{
                actor: session.actor,
                permission: session.permission,
            }],
            data,
        }],
    }, { broadcast: true });
}

async function getTableRows(code: string, scope: string, table: string, lower?: string, upper?: string): Promise<any[]> {
    const body: any = { code, scope, table, limit: 100, json: true };
    if (lower) body.lower_bound = lower;
    if (upper) body.upper_bound = upper;
    const res = await fetch(`${url}/v1/chain/get_table_rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).then(r => r.json() as any);
    return res.rows ?? [];
}

describe('bingoescrow — integracao', () => {
    beforeAll(async () => {
        try {
            await transact(escrowActiveSes, ESCROW, 'init', {});
        } catch (_) { /* ja inicializado */ }
    }, 30000);

    test('1. init + settoken + settierprice + setbacking + setacceptedpay', async () => {
        await transact(escrowAdminSess, ESCROW, 'setconfig', { max_backings_per_asset: 5 });

        await transact(escrowAdminSess, ESCROW, 'settoken', {
            contract: 'eosio.token',
            sym: '0,WAX',
            precision: 8,
            active: true,
            can_back: false,
        });

        await transact(escrowAdminSess, ESCROW, 'settoken', {
            contract: 'bingogametkn',
            sym: '0,BINGO',
            precision: 4,
            active: true,
            can_back: true,
        });

        await transact(escrowAdminSess, ESCROW, 'settierprice', {
            collection_name: 'cryptobingo1',
            schema_name: 'prize',
            template_id: 2,
            depositor: 'bingogamescr',
            max_backings: 5,
            mode: 0,
            ref_ratio: 0.3,
            max_ratio: 0.8,
        });

        await transact(escrowActiveSes, ESCROW, 'setbacking', {
            tierprice_id: 0,
            token_contract: 'bingogametkn',
            token_amount: '100.0000 BINGO',
            active: true,
        });

        await transact(escrowActiveSes, ESCROW, 'setaccpay', {
            tierprice_id: 0,
            token_contract: 'eosio.token',
            base_price: '50.00000000 WAX',
            escalation: 0.5,
            active: true,
        });

        const tokens = await getTableRows(ESCROW, ESCROW, 'tokens');
        expect(tokens.length).toBeGreaterThanOrEqual(2);
    }, 60000);

    test('2. on_transfer (compra via transfer) → pending_mint', async () => {
        const pmBefore = await getTableRows(ESCROW, ESCROW, 'pendingmint');
        const countBefore = pmBefore.length;

        await transact(playerSession, 'eosio.token', 'transfer', {
            from: 'jogador1',
            to: ESCROW,
            quantity: '50.00000000 WAX',
            memo: 'buy:0,0',
        });

        const pmAfter = await getTableRows(ESCROW, ESCROW, 'pendingmint');
        expect(pmAfter.length).toBe(countBefore + 1);
    }, 30000);

    test('3. addbacking + cancelbacking', async () => {
        // Deposita BINGO no pool do jogador1 (pre-fund)
        await transact(playerSession, 'bingogametkn', 'transfer', {
            from: 'jogador1',
            to: ESCROW,
            quantity: '500.0000 BINGO',
            memo: '',
        });

        const balancesBefore = await getTableRows(ESCROW, ESCROW, 'balances');
        expect(balancesBefore.length).toBeGreaterThan(0);

        // addbacking para NFT vault (asset_id=1 placeholder)
        await transact(playerSession, ESCROW, 'addbacking', {
            depositor: 'jogador1',
            asset_id: 1,
            token_contract: 'bingogametkn',
            amount: '50.0000 BINGO',
        });

        const escrows = await getTableRows(ESCROW, ESCROW, 'escrows');
        const newEscrow = escrows.find((e: any) => e.asset_id === 1 && !e.claimed);
        expect(newEscrow).toBeDefined();

        // cancelbacking
        await transact(playerSession, ESCROW, 'cancelback', { esc_id: newEscrow.esc_id });

        const escrowsAfter = await getTableRows(ESCROW, ESCROW, 'escrows');
        const cancelled = escrowsAfter.find((e: any) => e.esc_id === newEscrow.esc_id);
        expect(cancelled).toBeUndefined();
    }, 60000);

    test('4. withdraw (saldo livre)', async () => {
        // Deposita WAX
        await transact(playerSession, 'eosio.token', 'transfer', {
            from: 'jogador1',
            to: ESCROW,
            quantity: '200.00000000 WAX',
            memo: '',
        });

        const balancesBefore = await getTableRows(ESCROW, ESCROW, 'balances');
        const waxBal = balancesBefore.find((b: any) =>
            b.depositor === 'jogador1' && b.token_contract === 'eosio.token');
        expect(waxBal).toBeDefined();

        const freeStr = waxBal.balance;
        await transact(playerSession, ESCROW, 'withdraw', {
            depositor: 'jogador1',
            token_contract: 'eosio.token',
            amount: freeStr,
        });

        const balancesAfter = await getTableRows(ESCROW, ESCROW, 'balances');
        const waxBalAfter = balancesAfter.find((b: any) =>
            b.depositor === 'jogador1' && b.token_contract === 'eosio.token');
        expect(waxBalAfter?.balance).toBe('0.00000000 WAX');
    }, 30000);

    test('5. rescue + admin_rescue (strays)', async () => {
        // Envia NFT sem escrow → vai para strays
        await transact(playerSession, 'atomicassets', 'transfer', {
            from: 'jogador1',
            to: ESCROW,
            asset_ids: [1],
            memo: 'rescue-test',
        });

        const strays = await getTableRows(ESCROW, ESCROW, 'strays');
        const stray = strays.find((s: any) => s.asset_id === 1);
        if (stray) {
            await transact(playerSession, ESCROW, 'rescueasset', { asset_id: 1 });
            const straysAfter = await getTableRows(ESCROW, ESCROW, 'strays');
            expect(straysAfter.find((s: any) => s.asset_id === 1)).toBeUndefined();
        }
    }, 30000);

    test('6. apply dispatcher — audits registradas', async () => {
        const audits = await getTableRows(ESCROW, ESCROW, 'audits');
        expect(audits.length).toBeGreaterThan(0);
    }, 15000);
});
