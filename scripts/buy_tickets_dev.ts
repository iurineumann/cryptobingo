import { Session }                from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { PrivateKey, UInt64, Name, Bytes, ExtendedAsset, Serializer, Checksum256 } from '@wharfkit/antelope';

const RPC_URL       = process.env.RPC_URL  || 'http://127.0.0.1:8888';
const CHAIN_ID      = process.env.CHAIN_ID!;
const J1_KEY        = process.env.JOGADOR1_KEY!;
const J2_KEY        = process.env.JOGADOR2_KEY!;
const BINGO_KEY     = process.env.BINGO_GAME_KEY!;
const GAME_ID       = process.env.GAME_ID!;

// Cartela 5x5 — 24 bytes (FREE SPACE na posição 12 omitido, como no harness)
// Posições: 0-11 e 13-24 (sem índice 12)
// Com max_balls=35, bolas 1-24 são altamente prováveis de ser sorteadas
const TEST_MATRIX = new Uint8Array([
  1, 2, 3, 4, 5,           // posições 0-4  → ROW_0 (mask bits 0-4)
  6, 7, 8, 9, 10,          // posições 5-9  → ROW_1 (mask bits 5-9)
  11, 13, 14, 40,          // posições 10-13 → N col (bit 12 = FREE SPACE automático)
  15, 16, 17, 18, 19,      // posições 14-18 → ROW_3
  20, 21, 22, 23, 24,      // posições 19-23 → ROW_4
]); // 24 bytes total

function makeSession(playerKey: string, playerName: string) {
  return new Session({
    actor: playerName, permission: 'active',
    chain: { id: CHAIN_ID, url: RPC_URL },
    walletPlugin: new WalletPluginPrivateKey(PrivateKey.from(playerKey)),
  });
}

async function deposit(playerKey: string, playerName: string) {
  const session = makeSession(playerKey, playerName);
  await session.transact({
    actions: [{
      account: 'eosio.token', name: 'transfer',
      authorization: [session.permissionLevel],
      data: { from: playerName, to: 'bingogamectr', quantity: '10.0000 WAX', memo: 'deposit' },
    }],
  }, { broadcast: true });
}

async function buy(playerKey: string, playerName: string) {
  const session    = makeSession(playerKey, playerName);
  const bingoPriv  = PrivateKey.from(BINGO_KEY);
  const owner      = Name.from(playerName);
  const matrix     = Bytes.from(TEST_MATRIX);
  const gameIdU64  = UInt64.from(GAME_ID);

  // Assinatura contextual: sha256(bytes(matrix) || uint64(game_id) || name(owner))
  // Assinada pela chave BINGO_GAME_KEY (verifica que o servidor gerou a cartela)
  const matBuf  = Serializer.encode({ type: 'bytes',  object: matrix     }).array;
  const gameBuf = Serializer.encode({ type: 'uint64', object: gameIdU64  }).array;
  const ownBuf  = Serializer.encode({ type: 'name',   object: owner      }).array;
  const sig     = bingoPriv.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

  const r = await session.transact({
    actions: [{
      account: 'bingogamectr', name: 'buytickets',
      authorization: [session.permissionLevel],
      data: {
        buyer:           owner,
        game_id:         gameIdU64,
        matrices:        [matrix],
        signatures:      [sig],
        nft_id:          0,
        requested_price: ExtendedAsset.from({ quantity: '0.0000 WAX', contract: 'eosio.token' }),
      },
    }],
  }, { broadcast: true });
  return r.response?.transaction_id;
}

(async () => {
  console.log('Depositando WAX...');
  await deposit(J1_KEY, 'jogador1');
  await deposit(J2_KEY, 'jogador2');
  console.log(`Comprando cartelas no game ${GAME_ID}...`);
  const tx1 = await buy(J1_KEY, 'jogador1');
  console.log(`jogador1 TX: ${tx1?.slice(0,16)}...`);
  const tx2 = await buy(J2_KEY, 'jogador2');
  console.log(`jogador2 TX: ${tx2?.slice(0,16)}...`);
  console.log('OK — cartelas compradas.');
})().catch(e => { console.error('ERRO:', e.stack ?? e.message); process.exit(1); });
