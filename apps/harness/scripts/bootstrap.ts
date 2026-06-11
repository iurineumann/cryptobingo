import { PrivateKey, Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { Serializer, ABI } from '@wharfkit/antelope'; 
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../../.dune.env') });

const url = process.env.RPC_URL!;
const chainId = process.env.CHAIN_ID!;

const eosioKey = PrivateKey.from(process.env.EOSIO_KEY!);
const bingoKey = PrivateKey.from(process.env.BINGO_GAME_KEY!);
const alienKey = PrivateKey.from(process.env.ALIEN_WORLDS_KEY!);
const eosioTokenKey = PrivateKey.from(process.env.EOSIO_TOKEN_KEY!);

const eosioTokenSession = new Session({ actor: 'eosio.token', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(eosioTokenKey) });
const bingoSession = new Session({ actor: 'bingogamectr', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(bingoKey) });
const bingoOwnerSession = new Session({ actor: 'bingogamectr', permission: 'owner', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(bingoKey) });
const alienSession = new Session({ actor: 'alien.worlds', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(alienKey) });

const orngKey = PrivateKey.from(process.env.ORNG_WAX_KEY!); // A chave que está no .dune.env
const orngSession = new Session({ actor: 'orng.wax', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(orngKey) });
const orngOwnerSession = new Session({ actor: 'orng.wax', permission: 'owner', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(orngKey) });

async function deployContractRaw(account: string, wasmPath: string, abiPath: string, session: Session) {
    console.log(`[+] Realizando Deploy em: ${account}...`);
    const wasmHex = fs.readFileSync(path.resolve(__dirname, wasmPath)).toString('hex');
    const abiJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, abiPath), 'utf8'));
    const abi = ABI.from(abiJson);
    const abiHex = Serializer.encode({object: abi}).hexString;

    await session.transact({
        actions: [
            { account: 'eosio', name: 'setcode', authorization: [{ actor: account, permission: 'active' }], data: { account, vmtype: 0, vmversion: 0, code: wasmHex } },
            { account: 'eosio', name: 'setabi', authorization: [{ actor: account, permission: 'active' }], data: { account, abi: abiHex } }
        ]
    }, { broadcast: true });
}

async function bootstrap() {
    console.log('🚀 Iniciando Bootstrapping Definitivo...');
    try { 

        console.log('[+] Realizando Deploy em: orng.wax...');
        await deployContractRaw('orng.wax', '../../../contracts/orng_mock.wasm', '../../../contracts/orng_mock.abi', orngSession);

        console.log('[+] Configurando permissão eosio.code para orng.wax...');
        await orngOwnerSession.transact({
            actions: [{
                account: 'eosio', name: 'updateauth', authorization: [{ actor: 'orng.wax', permission: 'owner' }],
                data: {
                    account: 'orng.wax', permission: 'active', parent: 'owner',
                    auth: {
                        threshold: 1, keys: [{ key: orngKey.toPublic().toString(), weight: 1 }],
                        accounts: [{ permission: { actor: 'orng.wax', permission: 'eosio.code' }, weight: 1 }], waits: []
                    }
                }
            }]
        }, { broadcast: true });

        
        await deployContractRaw('bingogamectr', '../../contracts/bingo/bingo.wasm', '../../contracts/bingo/bingo.abi', bingoSession);

        console.log('[+] Configurando chave e permissão eosio.code...');
        await bingoSession.transact({
            actions: [{ account: 'bingogamectr', name: 'setconfig', authorization: [{ actor: 'bingogamectr', permission: 'active' }], data: { signer_key: bingoKey.toPublic().toString() } }]
        }, { broadcast: true });

        await bingoOwnerSession.transact({
            actions: [{
                account: 'eosio', name: 'updateauth', authorization: [{ actor: 'bingogamectr', permission: 'owner' }],
                data: {
                    account: 'bingogamectr', permission: 'active', parent: 'owner',
                    auth: {
                        threshold: 1, keys: [{ key: bingoKey.toPublic().toString(), weight: 1 }],
                        accounts: [{ permission: { actor: 'bingogamectr', permission: 'eosio.code' }, weight: 1 }], waits: []
                    }
                }
            }]
        }, { broadcast: true });
    } catch (e) {
        console.error('❌ Erro no deploy:', e);
        return;
    }

    try {
        console.log('[+] Criando o token TLM e distribuindo liquidez...');
        await eosioTokenSession.transact({
            actions: [{ account: 'eosio.token', name: 'create', authorization: [{ actor: 'eosio.token', permission: 'active' }], data: { issuer: 'alien.worlds', maximum_supply: '5000000.0000 TLM' } }]
        }, { broadcast: true });

        await alienSession.transact({
            actions: [
                { account: 'eosio.token', name: 'issue', authorization: [{ actor: 'alien.worlds', permission: 'active' }], data: { to: 'alien.worlds', quantity: '50000.0000 TLM', memo: 'Init' } },
                { account: 'eosio.token', name: 'transfer', authorization: [{ actor: 'alien.worlds', permission: 'active' }], data: { from: 'alien.worlds', to: 'bingogamectr', quantity: '1000.0000 TLM', memo: 'Sponsor Pool' } },
                { account: 'eosio.token', name: 'transfer', authorization: [{ actor: 'alien.worlds', permission: 'active' }], data: { from: 'alien.worlds', to: 'jogador1', quantity: '500.0000 TLM', memo: 'Airdrop Jogador 1' } }
            ]
        }, { broadcast: true });
        console.log('🎉 Bootstrapping 100% concluído com sucesso!');
    } catch (e: any) {
        if (!e.message.includes('token with symbol already exists')) {
            console.error('❌ Erro nos tokens:', e);
        }
    }
}
bootstrap();