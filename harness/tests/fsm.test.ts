import { APIClient, PrivateKey, Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { Serializer, Checksum256, Name, UInt64, ExtendedAsset, Bytes } from '@wharfkit/antelope';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.dune.env') });

const url = process.env.RPC_URL || 'http://127.0.0.1:8888';
const chainId = process.env.CHAIN_ID || '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
const client = new APIClient({ url });

const eosioKey = PrivateKey.from(process.env.EOSIO_KEY!);
const playerKey = PrivateKey.from(process.env.JOGADOR1_KEY!);
const bingoKey = PrivateKey.from(process.env.BINGO_GAME_KEY!);

const rootSession = new Session({ actor: 'eosio', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(eosioKey) });
const bingoSession = new Session({ actor: 'bingo.game', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(bingoKey) });
const playerSession = new Session({ actor: 'jogador1', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(playerKey) });
const microserviceSession = new Session({ actor: 'microservice', permission: 'active', chain: { id: chainId, url }, walletPlugin: new WalletPluginPrivateKey(eosioKey) });

let currentGameId: UInt64;
let currentGameIdStr: string;

describe("Bingo Autônomo (DeFi) FSM Tests", () => {
    
    beforeAll(async () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz12345';
        let randomStr = 'game.';
        for (let i = 0; i < 5; i++) {
            randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        const gameName = Name.from(randomStr);
        currentGameIdStr = gameName.toString();
        currentGameId = gameName.value; 
        
        console.log(`\n🎲 Iniciando testes com Jogo ID: ${currentGameIdStr}\n`);

        try {
            await rootSession.transact({
                actions: [
                    { account: 'eosio', name: 'newaccount', authorization: [rootSession.permissionLevel], data: { creator: 'eosio', name: 'microservice', owner: { threshold: 1, keys: [{ key: eosioKey.toPublic().toString(), weight: 1 }], accounts: [], waits: [] }, active: { threshold: 1, keys: [{ key: eosioKey.toPublic().toString(), weight: 1 }], accounts: [], waits: [] } } },
                    { account: 'eosio', name: 'buyrambytes', authorization: [rootSession.permissionLevel], data: { payer: 'eosio', receiver: 'microservice', bytes: 8192000 } },
                    { account: 'eosio', name: 'delegatebw', authorization: [rootSession.permissionLevel], data: { from: 'eosio', receiver: 'microservice', stake_net_quantity: '100.0000 WAX', stake_cpu_quantity: '100.0000 WAX', transfer: false } }
                ]
            }, { broadcast: true });
        } catch (e) { /* Conta já existe */ }
    });

    test("Passo 1: Criar um novo jogo (creategame)", async () => {
        const result = await bingoSession.transact({
            actions: [{ account: 'bingo.game', name: 'creategame', authorization: [bingoSession.permissionLevel], data: { game_id: currentGameId, ticket_price: ExtendedAsset.from({ quantity: "10.0000 TLM", contract: "eosio.token" }) } }]
        }, { broadcast: true });
        expect(result.response).toBeDefined();
    });

    test("Passo 2: Jogador deposita fundos reais (deposit via on_notify)", async () => {
        const result = await playerSession.transact({
            actions: [{ account: 'eosio.token', name: 'transfer', authorization: [playerSession.permissionLevel], data: { from: 'jogador1', to: 'bingo.game', quantity: '50.0000 TLM', memo: 'Deposit para jogar' } }]
        }, { broadcast: true });
        expect(result.response).toBeDefined();
    });

    test("Passo 3: Assinar e comprar cartela (buytickets)", async () => {
        const matrix = [1,2,3,4,5, 6,7,8,9,10, 11,12,13,14,15, 16,17,18,19,20, 21,22,23,24,25];
        const matrixBytesObj = Bytes.from(new Uint8Array(matrix));
        const owner = Name.from('jogador1');

        const matrixBytes = Serializer.encode({ type: 'bytes', object: matrixBytesObj }).array;
        const gameIdBytes = Serializer.encode({ type: 'uint64', object: currentGameId }).array;
        const ownerBytes = Serializer.encode({ type: 'name', object: owner }).array;

        const buffer = new Uint8Array([...matrixBytes, ...gameIdBytes, ...ownerBytes]);
        const hash = Checksum256.hash(buffer);
        const signatureObj = bingoKey.signDigest(hash);

        const result = await playerSession.transact({
            actions: [{ account: 'bingo.game', name: 'buytickets', authorization: [playerSession.permissionLevel], data: { owner: owner, game_id: currentGameId, matrices: [matrixBytesObj], signatures: [signatureObj] } }]
        }, { broadcast: true });
        expect(result.response).toBeDefined();
    });

    test("Passo 4: Travar o jogo (lockgame)", async () => {
        const result = await microserviceSession.transact({
            actions: [{ account: 'bingo.game', name: 'lockgame', authorization: [microserviceSession.permissionLevel], data: { game_id: currentGameId } }]
        }, { broadcast: true });
        expect(result.response).toBeDefined();
    });

    test("Passo 5: Iniciar o Sorteio (startdraw)", async () => {
        const result = await microserviceSession.transact({
            actions: [{ account: 'bingo.game', name: 'startdraw', authorization: [microserviceSession.permissionLevel], data: { game_id: currentGameId } }]
        }, { broadcast: true });
        expect(result.response).toBeDefined();
    });

    test("Passo 6: Registrar vitória e pagar prêmio RTP (claimwin)", async () => {
        let ticketId: UInt64;
        // A API Nodeos agora lerá o ABI perfeito com json: true e extrairá o ticket_id correto!
        try{
            console.log('Buscando tickets para o jogo:', currentGameIdStr);
            console.log('Parâmetros da consulta:', { code: 'bingo.game', scope: currentGameIdStr, table: 'tickets', json: true });
            
            const tableResult = await client.v1.chain.get_table_rows({ 
                code: 'bingo.game', 
                scope: currentGameIdStr, 
                table: 'tickets', 
                json: true 
            });
        
            expect(tableResult.rows.length).toBeGreaterThan(0);
            ticketId = UInt64.from(tableResult.rows[0].ticket_id);

        } catch (e) {
            console.error('Erro ao buscar tickets:', e);
            throw e;
        }

        const result = await microserviceSession.transact({
            actions: [{ 
                account: 'bingo.game', 
                name: 'claimwin', 
                authorization: [microserviceSession.permissionLevel], 
                data: { game_id: currentGameId, ticket_id: ticketId, ball_count: 45, win_pattern_mask: UInt64.from(1) } 
            }]
        }, { broadcast: true });
        expect(result.response).toBeDefined();
    });

    test("Passo 7: Sacar ganhos para a carteira externa (withdraw)", async () => {
        const result = await playerSession.transact({
            actions: [{ account: 'bingo.game', name: 'withdraw', authorization: [playerSession.permissionLevel], data: { owner: 'jogador1', amount: ExtendedAsset.from({ quantity: "8.5000 TLM", contract: "eosio.token" }) } }]
        }, { broadcast: true });
        expect(result.response).toBeDefined();
    });
});