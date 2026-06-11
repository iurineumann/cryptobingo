import { APIClient, PrivateKey, Session, Serializer, Action } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import * as fs from 'fs';
import * as path from 'path';

// 1. Configuração do Testbed (Localhost)
const url = 'http://127.0.0.1:8888';
const client = new APIClient({ url });

// A chave mestra do ambiente de desenvolvimento (EOSIO_ROOT_KEY)
const eosioKey = PrivateKey.from('5KQwrPbwdL6PhXujxW278EGzaVqexa18rcMvUKdpjzJVjc4jgw');
const eosioWallet = new WalletPluginPrivateKey(eosioKey);

// 2. Utilitário de Sessão Root
const rootSession = new Session({
    actor: 'eosio',
    permission: 'active',
    chain: { id: 'testbed', url },
    walletPlugin: eosioWallet,
});

/**
 * Utilitário: Cria uma conta nova na blockchain alocando RAM e CPU infinita para testes
 */
async function createAccount(accountName: string, pubKey: string) {
    console.log(`[+] Criando conta: ${accountName}...`);
    const action = Action.from({
        account: 'eosio',
        name: 'newaccount',
        authorization: [rootSession.permissionLevel],
        data: {
            creator: 'eosio',
            name: accountName,
            owner: { threshold: 1, keys: [{ key: pubKey, weight: 1 }], accounts: [], waits: [] },
            active: { threshold: 1, keys: [{ key: pubKey, weight: 1 }], accounts: [], waits: [] },
        },
    });

    // Em um ambiente real, você faria buyram e delegatebw. 
    // No Testbed, a conta eosio tem recursos ilimitados.
    await rootSession.transact({ actions: [action] }, { broadcast: true });
}

/**
 * Utilitário: Faz o deploy de arquivos .wasm e .abi
 */
async function deployContract(account: string, wasmPath: string, abiPath: string) {
    console.log(`[+] Realizando Deploy no contrato: ${account}...`);
    const wasmHex = fs.readFileSync(path.resolve(__dirname, wasmPath)).toString('hex');
    const abiHex = Serializer.encode({
        object: JSON.parse(fs.readFileSync(path.resolve(__dirname, abiPath), 'utf8')),
        type: 'abi_def'
    }).hexString;

    await rootSession.transact({
        actions: [
            {
                account: 'eosio',
                name: 'setcode',
                authorization: [{ actor: account, permission: 'active' }],
                data: { account, vmtype: 0, vmversion: 0, code: wasmHex }
            },
            {
                account: 'eosio',
                name: 'setabi',
                authorization: [{ actor: account, permission: 'active' }],
                data: { account, abi: abiHex }
            }
        ]
    }, { broadcast: true });
}

// 3. Orquestração do Bootstrapping
async function bootstrap() {
    try {
        console.log('🚀 Iniciando Bootstrapping do Testbed GameFi...');

        // Chave genérica para as contas de teste
        const testPubKey = eosioKey.toPublic().toString();

        // Passo 1: Criar contas do ecossistema
        await createAccount('eosio.token', testPubKey);
        await createAccount('orng.wax', testPubKey);
        await createAccount('bingogamectr', testPubKey);
        await createAccount('alien.worlds', testPubKey); // Conta patrocinadora B2B
        await createAccount('jogador1', testPubKey);
        await createAccount('jogador2', testPubKey);

        // Passo 2: Deploy do contrato eosio.token (Padrão Antelope)
        await deployContract('eosio.token', '../mocks/eosio.token.wasm', '../mocks/eosio.token.abi');

        // Passo 3: Emitir moedas e criar a Economia Fake
        console.log('[+] Emitindo WAX (Moeda Base) e TLM (Moeda Patrocinada)...');
        await rootSession.transact({
            actions: [
                // Criar os Tokens
                Action.from({
                    account: 'eosio.token', name: 'create',
                    authorization: [{ actor: 'eosio.token', permission: 'active' }],
                    data: { issuer: 'eosio', maximum_supply: '1000000000.0000 WAX' }
                }),
                Action.from({
                    account: 'eosio.token', name: 'create',
                    authorization: [{ actor: 'eosio.token', permission: 'active' }],
                    data: { issuer: 'alien.worlds', maximum_supply: '5000000.0000 TLM' }
                }),
                // Emitir para os emissores
                Action.from({
                    account: 'eosio.token', name: 'issue',
                    authorization: [{ actor: 'eosio', permission: 'active' }],
                    data: { to: 'eosio', quantity: '1000000.0000 WAX', memo: 'Init' }
                }),
                Action.from({
                    account: 'eosio.token', name: 'issue',
                    authorization: [{ actor: 'alien.worlds', permission: 'active' }],
                    data: { to: 'alien.worlds', quantity: '50000.0000 TLM', memo: 'B2B Init' }
                }),
                // Distribuir para os jogadores
                Action.from({
                    account: 'eosio.token', name: 'transfer',
                    authorization: [{ actor: 'eosio', permission: 'active' }],
                    data: { from: 'eosio', to: 'jogador1', quantity: '5000.0000 WAX', memo: 'Saldo Inicial' }
                })
            ]
        }, { broadcast: true });

        // Passo 4: Deploy do Mock do Oráculo e do nosso Contrato
        console.log('[+] Injetando Oráculo Mockado e Smart Contract do Bingo...');
        await deployContract('orng.wax', '../mocks/orng_mock.wasm', '../mocks/orng_mock.abi');
        await deployContract('bingogamectr', '../../contracts/bingo.wasm', '../../contracts/bingo.abi');

        console.log('✅ Bootstrapping concluído! A blockchain local está estéril, financiada e pronta para os Testes Unitários.');

    } catch (error) {
        console.error('❌ Erro no Bootstrapping:', error);
    }
}

bootstrap();