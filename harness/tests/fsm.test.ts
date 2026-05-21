import { PrivateKey, Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { Serializer, Checksum256, Name, UInt64, ExtendedAsset } from '@wharfkit/antelope';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.dune.env') });

const url = process.env.RPC_URL || 'http://127.0.0.1:8888';
const chainId = process.env.CHAIN_ID || '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';

const eosioKey = PrivateKey.from(process.env.EOSIO_KEY!);
const playerKey = PrivateKey.from(process.env.JOGADOR1_KEY!);
const bingoKey = PrivateKey.from(process.env.BINGO_GAME_KEY!);

const rootSession = new Session({ actor: 'eosio', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(eosioKey) });
const bingoSession = new Session({ actor: 'bingo.game', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(bingoKey) });
const playerSession = new Session({ actor: 'jogador1', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(playerKey) });
const microserviceSession = new Session({ actor: 'microservice', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(eosioKey) });

describe("Bingo FSM Integration Tests", () => {
    
    beforeAll(async () => {
        try {
            // CORREÇÃO 1: Criação, Compra de RAM e Delegação de Recursos na MESMA transação!
            await rootSession.transact({
                actions: [
                    {
                        account: 'eosio', name: 'newaccount',
                        authorization: [rootSession.permissionLevel],
                        data: {
                            creator: 'eosio', name: 'microservice',
                            owner: { threshold: 1, keys: [{ key: eosioKey.toPublic().toString(), weight: 1 }], accounts: [], waits: [] },
                            active: { threshold: 1, keys: [{ key: eosioKey.toPublic().toString(), weight: 1 }], accounts: [], waits: [] },
                        },
                    },
                    {
                        account: 'eosio', name: 'buyrambytes',
                        authorization: [rootSession.permissionLevel],
                        data: { payer: 'eosio', receiver: 'microservice', bytes: 8192000 }
                    },
                    {
                        account: 'eosio', name: 'delegatebw',
                        authorization: [rootSession.permissionLevel],
                        data: { from: 'eosio', receiver: 'microservice', stake_net_quantity: '100.0000 WAX', stake_cpu_quantity: '100.0000 WAX', transfer: false }
                    }
                ]
            }, { broadcast: true });
        } catch (e) {
            // Se já existir, tudo bem.
            console.log("Aviso no setup (conta pode já existir):", (e as Error).message);
        }
    });

    test("Deve criar um novo jogo (creategame)", async () => {
        const result = await bingoSession.transact({
            actions: [{
                account: 'bingo.game', name: 'creategame',
                authorization: [bingoSession.permissionLevel],
                data: {
                    game_id: 1,
                    ticket_price: ExtendedAsset.from({ quantity: "10.0000 TLM", contract: "eosio.token" }),
                },
            }]
        }, { broadcast: true });
        expect(result.response).toBeDefined();
    });

    test("Deve gerar assinatura e comprar cartela (buytickets)", async () => {
        // A cartela real tem 24 números (pulamos o espaço central livre)
        const matrix = [1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25];
        
        // Converte a matriz para HexString (a língua materna do Wharfkit para o tipo 'bytes')
        const matrixHex = Buffer.from(matrix).toString('hex');
        
        const gameId = UInt64.from(1);
        const owner = Name.from('jogador1');

        // Serializamos para bytes usando o HexString para gerar a assinatura exatamente como o C++ espera
        const matrixBytes = Serializer.encode({ type: 'bytes', object: matrixHex }).array;
        const gameIdBytes = Serializer.encode({ type: 'uint64', object: gameId }).array;
        const ownerBytes = Serializer.encode({ type: 'name', object: owner }).array;

        const buffer = new Uint8Array([...matrixBytes, ...gameIdBytes, ...ownerBytes]);
        const hash = Checksum256.hash(buffer);
        
        const signature = eosioKey.signDigest(hash).toString();

        const result = await playerSession.transact({
            actions: [{
                account: 'bingo.game',
                name: 'buytickets',
                authorization: [playerSession.permissionLevel],
                data: {
                    owner: 'jogador1',
                    game_id: 1,
                    matrices: [matrixHex], // Passamos o HexString (24 bytes cravados)
                    signatures: [signature],
                },
            }]
        }, { broadcast: true });
        
        expect(result.response).toBeDefined();
    });

    test("Deve travar o jogo (lockgame)", async () => {
        const result = await microserviceSession.transact({
            actions: [{
                account: 'bingo.game', name: 'lockgame',
                authorization: [microserviceSession.permissionLevel],
                data: { game_id: 1 },
            }]
        }, { broadcast: true });
        expect(result.response).toBeDefined();
    });
});