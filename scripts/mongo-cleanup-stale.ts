// scripts/mongo-cleanup-stale.ts
// Remove documentos stale do MongoDB cujos IDs não existem on-chain.
// Idempotente e seguro: --dry-run para preview sem deleção.
//
// Uso:
//   NODE_PATH=apps/worker-game-loop/node_modules \
//     node node_modules/.pnpm/ts-node@*/node_modules/ts-node/dist/bin.js \
//     --transpile-only --project scripts/tsconfig.json \
//     scripts/mongo-cleanup-stale.ts [--dry-run]
//
// Para apontar para testnet (substitui .env):
//   RPC_URL=https://waxtestnet.greymass.com \
//     NODE_PATH=apps/worker-game-loop/node_modules \
//     node ... scripts/mongo-cleanup-stale.ts

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { APIClient } from '@wharfkit/antelope';

// ── Config ───────────────────────────────────────────────────────────────────

// Carrega .env manualmente (dotenv não disponível no root do monorepo)
const envPath = path.resolve(__dirname, '../apps/worker-game-loop/.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  console.error('Fatal: MONGO_URL não definido. Verifique apps/worker-game-loop/.env');
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8888';
const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';
const DRY_RUN = process.argv.includes('--dry-run');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchOnChainIds(
  rpc: APIClient,
  table: string,
  idField: string,
): Promise<Set<number>> {
  const res = await rpc.v1.chain.get_table_rows({
    code: CONTRACT_ACCOUNT,
    scope: CONTRACT_ACCOUNT,
    table,
    limit: 100,
    json: true,
  });
  return new Set((res.rows as any[]).map(r => Number(r[idField])));
}

async function deleteStaleDocs(
  collection: mongoose.mongo.Collection,
  idField: string,
  onChainIds: Set<number>,
  label: string,
): Promise<number> {
  const allDocs = await collection.find({}, { projection: { _id: 1, [idField]: 1 } }).toArray();
  let removed = 0;

  for (const doc of allDocs) {
    const docId = doc[idField];
    const numericId = typeof docId === 'string' ? parseInt(docId, 10) : Number(docId);
    if (isNaN(numericId) || onChainIds.has(numericId)) continue;

    if (DRY_RUN) {
      console.log(`[DRY-RUN] would DELETE ${label} ${idField}=${docId} (not on-chain)`);
    } else {
      await collection.deleteOne({ _id: doc._id });
      console.log(`[DELETE] ${label} ${idField}=${docId} (not on-chain)`);
    }
    removed++;
  }

  return removed;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[MONGO CLEANUP] Starting...${DRY_RUN ? ' (DRY-RUN mode)' : ''}`);
  console.log(`  RPC URL  : ${RPC_URL}`);
  console.log(`  Contract : ${CONTRACT_ACCOUNT}`);
  console.log(`  Mongo URL: ${MONGO_URL.replace(/\/\/.*@/, '//***@')}`);

  await mongoose.connect(MONGO_URL);
  console.log('[MONGO CLEANUP] MongoDB connected\n');

  const rpc = new APIClient({ url: RPC_URL });

  // 1. Fetch on-chain rooms
  console.log('[ON-CHAIN] Fetching rooms...');
  const onChainRooms = await fetchOnChainIds(rpc, 'rooms', 'room_id');
  console.log(`  Found ${onChainRooms.size} rooms on-chain: ${onChainRooms.size ? [...onChainRooms].sort((a,b)=>a-b).join(', ') : 'NONE'}`);
  if (onChainRooms.size === 0) {
    console.log('  ⚠ WARNING: 0 rooms on-chain. PODE ser ambiente vazio (local dev sem init_dev_env).');
    console.log('  ⚠ Se for testnet/produção, verifique RPC_URL e CONTRACT_ACCOUNT.');
  }

  // 2. Fetch on-chain gametypes
  console.log('[ON-CHAIN] Fetching gametypes...');
  const onChainGTs = await fetchOnChainIds(rpc, 'gametypes', 'gametype_id');
  console.log(`  Found ${onChainGTs.size} gametypes on-chain: ${onChainGTs.size ? [...onChainGTs].sort((a,b)=>a-b).join(', ') : 'NONE'}`);
  if (onChainGTs.size === 0) {
    console.log('  ⚠ WARNING: 0 gametypes on-chain. PODE ser ambiente vazio (local dev sem init_dev_env).');
    console.log('  ⚠ Se for testnet/produção, verifique RPC_URL e CONTRACT_ACCOUNT.');
  }

  // 3. Clean stale roommetadatas
  const roomCol = mongoose.connection.collection('roommetadatas');
  const removedRooms = await deleteStaleDocs(roomCol, 'room_id', onChainRooms, 'roommetadatas');

  // 4. Clean stale gametypemetadatas
  const gtCol = mongoose.connection.collection('gametypemetadatas');
  const removedGTs = await deleteStaleDocs(gtCol, 'gametype_id', onChainGTs, 'gametypemetadatas');

  // 5. Summary
  const mode = DRY_RUN ? 'Would remove' : 'Removed';
  console.log(`\n=== RESUMO ===`);
  console.log(`${mode} ${removedRooms} stale roommetadatas, ${removedGTs} stale gametypemetadatas`);
  if (!DRY_RUN && removedRooms + removedGTs === 0) {
    console.log('Nada a limpar — MongoDB consistente com on-chain');
  }

  await mongoose.disconnect();
  console.log('[MONGO CLEANUP] Done');
}

main().catch((err) => {
  console.error('[MONGO CLEANUP] Fatal:', err);
  process.exit(1);
});
