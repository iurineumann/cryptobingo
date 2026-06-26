// apps/harness/tests/campaigns.test.ts
// Testes E2E do fluxo de Campanhas B2B (ADR-008 + setcampaign).
//
// Cobertura:
//   Suite 1 — transfer memo=campaign:{id} → criar campanha + setcampaign
//   Suite 2 — setcampaign com leftover_policy=burn
//   Suite 3 — setcampaign não autorizada (não-admin)
//   Suite 4 — setcampaign em campanha inexistente
//   Suite 5 — linkcampaign com payout_per_game=0 rejeitado

import { PrivateKey, Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { Name, UInt64, ExtendedAsset } from '@wharfkit/antelope';
import { rpcClient } from '@cryptobingo/blockchain-core';

const url     = process.env.RPC_URL  || 'http://127.0.0.1:8888';
const chainId = process.env.CHAIN_ID || '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';

const eosioKey         = PrivateKey.from(process.env.EOSIO_KEY!);
const playerKey        = PrivateKey.from(process.env.JOGADOR1_KEY!);
const bingoKey         = PrivateKey.from((process.env.BINGO_GAME_KEY  || process.env.BINGOGAMECTR_KEY || process.env.CONTRACT_PRIVATE_KEY)!);

function makeSession(actor: string, key: PrivateKey, permission = 'active') {
    return new Session({
        actor, permission,
        chain: { id: chainId, url },
        walletPlugin: new WalletPluginPrivateKey(key),
    });
}

const rootSession     = makeSession('eosio', eosioKey);
const bingoSession    = makeSession('bingogamectr', bingoKey, 'active');
const sponsorSession  = makeSession('sponsor1', eosioKey);
const playerSession   = makeSession('jogador1', playerKey);

async function transact(session: Session, account: string, name: string, data: object) {
    return session.transact({
        actions: [{
            account, name,
            authorization: [session.permissionLevel],
            data,
        }],
    }, { broadcast: true });
}

async function getCampaignRow(campaignId: UInt64): Promise<any | null> {
    const res = await rpcClient.v1.chain.get_table_rows({
        code: 'bingogamectr', scope: 'bingogamectr', table: 'campaigns',
        lower_bound: campaignId, upper_bound: campaignId, limit: 1, json: true,
    });
    return res.rows[0] ?? null;
}

async function ensureSponsor() {
    try {
        await transact(rootSession, 'eosio', 'newaccount', {
            creator: 'eosio', name: 'sponsor1',
            owner:  { threshold: 1, keys: [{ key: eosioKey.toPublic().toString(), weight: 1 }], accounts: [], waits: [] },
            active: { threshold: 1, keys: [{ key: eosioKey.toPublic().toString(), weight: 1 }], accounts: [], waits: [] },
        });
    } catch { /* ok */ }
    try {
        await transact(rootSession, 'eosio.token', 'transfer', {
            from: 'eosio', to: 'sponsor1', quantity: '1000.0000 WAX', memo: 'seed',
        });
    } catch { /* ok */ }
}

describe('Campanhas B2B — deposit + setcampaign + linkcampaign', () => {

    function randomCampId(): number {
        return Math.floor(Math.random() * 1_000_000) + 10_000;
    }

    let CAMP1: number;
    let CAMP2: number;

    beforeAll(async () => {
        await ensureSponsor();
        CAMP1 = randomCampId();
        CAMP2 = randomCampId();
        console.log(`\n📦 Campanhas IDs: ${CAMP1}, ${CAMP2}\n`);
    });

    test('CMP-1: transfer memo=campaign:ID → criar campanha com payout_per_game=0', async () => {
        await transact(sponsorSession, 'eosio.token', 'transfer', {
            from: 'sponsor1', to: 'bingogamectr',
            quantity: '500.0000 WAX', memo: `campaign:${CAMP1}`,
        });
        await new Promise(r => setTimeout(r, 1000));

        const row = await getCampaignRow(UInt64.from(CAMP1));
        expect(row).not.toBeNull();
        expect(row.sponsor).toBe('sponsor1');
        expect(row.payout_per_game.quantity).toBe('0.0000 WAX');
        expect(row.payout_per_game.contract).toBe('eosio.token');
        expect(row.leftover_policy).toBe('refund');
        console.log(`   ✅ Campaign ${CAMP1} criada via campaign:ID`);
    });

    test('CMP-2: setcampaign define payout_per_game e leftover_policy=refund', async () => {
        await transact(bingoSession, 'bingogamectr', 'setcampaign', {
            campaign_id:     CAMP1,
            payout_per_game: ExtendedAsset.from({ quantity: '10.0000 WAX', contract: 'eosio.token' }),
            leftover_policy: Name.from('refund'),
        });
        const row = await getCampaignRow(UInt64.from(CAMP1));
        expect(row.payout_per_game.quantity).toBe('10.0000 WAX');
        expect(row.payout_per_game.contract).toBe('eosio.token');
        expect(row.leftover_policy).toBe('refund');
        console.log('   ✅ setcampaign: payout=10 WAX, leftover=refund');
    });

    test('CMP-3: setcampaign para leftover_policy=house', async () => {
        await transact(bingoSession, 'bingogamectr', 'setcampaign', {
            campaign_id:     CAMP1,
            payout_per_game: ExtendedAsset.from({ quantity: '5.0000 WAX', contract: 'eosio.token' }),
            leftover_policy: Name.from('house'),
        });
        const row = await getCampaignRow(UInt64.from(CAMP1));
        expect(row.leftover_policy).toBe('house');
        console.log('   ✅ setcampaign: leftover=house');
    });

    test('CMP-4: setcampaign por não-sponsor/não-admin deve falhar', async () => {
        await expect(transact(playerSession, 'bingogamectr', 'setcampaign', {
            campaign_id:     CAMP1,
            payout_per_game: ExtendedAsset.from({ quantity: '10.0000 WAX', contract: 'eosio.token' }),
            leftover_policy: Name.from('refund'),
        })).rejects.toThrow();
        console.log('   ✅ Não-sponsor rejeitado');
    });

    test('CMP-5: setcampaign em campaign_id inexistente deve falhar', async () => {
        await expect(transact(bingoSession, 'bingogamectr', 'setcampaign', {
            campaign_id:     99999,
            payout_per_game: ExtendedAsset.from({ quantity: '10.0000 WAX', contract: 'eosio.token' }),
            leftover_policy: Name.from('refund'),
        })).rejects.toThrow();
        console.log('   ✅ Campaign_id inexistente rejeitado');
    });

    test('CMP-6: linkcampaign com payout_per_game=0 deve falhar', async () => {
        // Cria segunda campanha sem setcampaign (payout fica 0)
        await transact(sponsorSession, 'eosio.token', 'transfer', {
            from: 'sponsor1', to: 'bingogamectr',
            quantity: '100.0000 WAX', memo: `campaign:${CAMP2}`,
        });
        await new Promise(r => setTimeout(r, 1000));

        await expect(transact(bingoSession, 'bingogamectr', 'linkcampaign', {
            game_id:     UInt64.from(99999),
            campaign_id: CAMP2,
        })).rejects.toThrow();
        console.log('   ✅ linkcampaign com payout=0 rejeitado');
    });
});
