// burnCron.ts — Cron automático de sincronização de burns (ADR-028 §8).
//
// Dois modos de operação:
//   Produção (ATOMICASSETS_API_URL definido): consulta REST /atomicassets/v1/burns
//     para cada coleção com regra BURN_TO_CLAIM. Chama recordburn para cada burn
//     novo — idempotente (contrato rejeita asset_id repetido).
//   Dev local (sem URL): ausência on-chain via snapshot Redis por jogador. Usa
//     syncBurns (burnSync.ts) que detecta ativos desaparecidos da carteira.
//
// Integração: index.ts chama startBurnSyncCron() no bootstrap.
// Adicionar jogador ao watch (dev): addBurnWatchPlayer(owner).

import { rpcClient } from '@cryptobingo/blockchain-core';
import { redisClient } from './redis';
import { executeRecordBurn } from './blockchain';
import { awardBurnXP } from './xpEngine';
import { syncBurns, BurnCandidate } from './burnSync';

const CONTRACT_ACCOUNT      = process.env.CONTRACT_ACCOUNT    || 'bingogamectr';
const ATOMIC_ACCOUNT        = process.env.ATOMICASSETS_ACCOUNT || 'atomicassets';
const BURN_CRON_INTERVAL_MS = parseInt(process.env.BURN_CRON_INTERVAL_MS || '60000');

// Lidos em runtime para permitir override nos testes (não capturar no module load)
const getApiUrl   = () => process.env.ATOMICASSETS_API_URL;

const RULE_BURN_TO_CLAIM = 4;

const WATCH_PLAYERS_KEY    = 'burn:watch_players';
const SNAPSHOT_KEY_PREFIX  = 'burn:snapshot:';
const SNAPSHOT_TTL_SEC     = 86400 * 7; // 7 dias

export interface BurnToClaimTemplate {
    templateId: string;
    collection: string;
}

// ── Lê nftconfigs on-chain → templates com regra BURN_TO_CLAIM ───────────

export async function fetchBurnToClaimTemplates(): Promise<BurnToClaimTemplate[]> {
    const templates: BurnToClaimTemplate[] = [];
    let lowerBound: string | undefined;
    let hasMore = true;
    while (hasMore) {
        const res: any = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT, table: 'nftconfigs',
            limit: 100, lower_bound: lowerBound as any, json: true,
        });
        for (const row of (res.rows as any[])) {
            const hasBurnToClaim = (row.rules ?? []).some((r: any) => r.type === RULE_BURN_TO_CLAIM);
            if (hasBurnToClaim) {
                templates.push({ templateId: String(row.template_id), collection: row.collection_name });
            }
        }
        hasMore = !!res.more && !!res.next_key;
        lowerBound = res.next_key;
    }
    return templates;
}

// ── Modo produção: consulta AtomicAssets REST API ─────────────────────────

interface ApiBurnRecord {
    owner:      string;
    assetId:    string;
    templateId: string;
    collection: string;
}

export async function fetchBurnsFromApi(templates: BurnToClaimTemplate[]): Promise<ApiBurnRecord[]> {
    const collections  = [...new Set(templates.map(t => t.collection))];
    const templateIds  = new Set(templates.map(t => t.templateId));
    const burns: ApiBurnRecord[] = [];

    for (const collection of collections) {
        let page = 1;
        while (true) {
            const url = `${getApiUrl()}/atomicassets/v1/burns?collection_name=${collection}&page=${page}&limit=100&order=asc`;
            let data: any;
            try {
                const res = await fetch(url);
                if (!res.ok) break;
                data = await res.json();
            } catch {
                break;
            }
            if (!data?.success || !Array.isArray(data.data) || !data.data.length) break;

            for (const b of data.data) {
                const tplId = String(b.template?.template_id ?? b.template_id ?? '');
                if (!templateIds.has(tplId)) continue;
                burns.push({
                    owner:      String(b.owner),
                    assetId:    String(b.asset_id),
                    templateId: tplId,
                    collection: String(b.collection?.collection_name ?? collection),
                });
            }
            if (data.data.length < 100) break;
            page++;
        }
    }
    return burns;
}

// ── Modo dev: snapshot Redis + ausência on-chain por jogador ──────────────

async function getPlayerSnapshot(owner: string): Promise<BurnCandidate[]> {
    const raw = await redisClient.get(`${SNAPSHOT_KEY_PREFIX}${owner}`);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
}

async function savePlayerSnapshot(owner: string, current: BurnCandidate[]): Promise<void> {
    await redisClient.set(
        `${SNAPSHOT_KEY_PREFIX}${owner}`,
        JSON.stringify(current),
        { EX: SNAPSHOT_TTL_SEC },
    );
}

async function getCurrentBurnToClaimAssets(
    owner: string,
    templates: BurnToClaimTemplate[],
): Promise<BurnCandidate[]> {
    const templateMap = new Map(templates.map(t => [t.templateId, t.collection]));
    const candidates: BurnCandidate[] = [];
    let lowerBound: string | undefined;
    let hasMore = true;
    while (hasMore) {
        const res: any = await rpcClient.v1.chain.get_table_rows({
            code: ATOMIC_ACCOUNT, scope: owner, table: 'assets',
            limit: 100, lower_bound: lowerBound as any, json: true,
        });
        for (const asset of (res.rows as any[])) {
            const tplId = String(asset.template_id);
            const col   = templateMap.get(tplId);
            if (col && col === asset.collection_name) {
                candidates.push({ assetId: String(asset.asset_id), templateId: Number(tplId), collection: col });
            }
        }
        hasMore = !!res.more && !!res.next_key;
        lowerBound = res.next_key;
    }
    return candidates;
}

/** Detecta burns por ausência para um jogador (dev). Atualiza snapshot após cada passagem. */
export async function syncPlayerBurns(owner: string, templates: BurnToClaimTemplate[]): Promise<string[]> {
    const [snapshot, current] = await Promise.all([
        getPlayerSnapshot(owner),
        getCurrentBurnToClaimAssets(owner, templates),
    ]);

    // Candidatos = snapshot ∪ current (snapshot pode conter assets já queimados)
    const seen = new Map<string, BurnCandidate>();
    for (const c of [...snapshot, ...current]) seen.set(c.assetId, c);
    const candidates = [...seen.values()];

    const recorded = await syncBurns(owner, candidates);
    // Salva somente os assets ainda possuídos (queimados desaparecem da próxima snapshot)
    await savePlayerSnapshot(owner, current);
    return recorded;
}

// ── Gerenciamento de jogadores monitorados (dev) ──────────────────────────

/** Adiciona `owner` ao conjunto de jogadores monitorados pelo cron. */
export async function addBurnWatchPlayer(owner: string): Promise<void> {
    await redisClient.sAdd(WATCH_PLAYERS_KEY, owner);
}

async function getWatchPlayers(): Promise<string[]> {
    const [fromRedis, fromEnv] = await Promise.all([
        redisClient.sMembers(WATCH_PLAYERS_KEY),
        Promise.resolve((process.env.BURN_WATCH_PLAYERS ?? '').split(',').filter(Boolean)),
    ]);
    return [...new Set([...fromRedis, ...fromEnv])];
}

// ── Ciclo de sincronização ────────────────────────────────────────────────

export async function runBurnSyncCycle(): Promise<{ processed: number; skipped: number }> {
    const templates = await fetchBurnToClaimTemplates();
    if (!templates.length) {
        console.log('[burnCron] Nenhum template BURN_TO_CLAIM configurado — ciclo pulado.');
        return { processed: 0, skipped: 0 };
    }

    let processed = 0;
    let skipped   = 0;

    if (getApiUrl()) {
        const burns = await fetchBurnsFromApi(templates);
        for (const burn of burns) {
            try {
                await executeRecordBurn(burn.owner, burn.assetId, burn.templateId, burn.collection);
                awardBurnXP(burn.owner, burn.collection, burn.templateId).catch(() => {});
                processed++;
            } catch (e: any) {
                const msg = String(e?.message ?? e);
                if (/ja registrado/i.test(msg)) skipped++;
                else {
                    console.warn(`⚠️ [burnCron] recordburn falhou asset ${burn.assetId}: ${msg}`);
                    skipped++;
                }
            }
        }
    } else {
        const players = await getWatchPlayers();
        for (const owner of players) {
            try {
                const recorded = await syncPlayerBurns(owner, templates);
                processed += recorded.length;
            } catch (e: any) {
                console.warn(`⚠️ [burnCron] syncPlayerBurns falhou ${owner}: ${e?.message ?? e}`);
            }
        }
    }

    console.log(`🔥 [burnCron] ciclo concluído: ${processed} registrados, ${skipped} já registrados`);
    return { processed, skipped };
}

export function startBurnSyncCron(): void {
    console.log(`🔥 [burnCron] iniciado (intervalo: ${BURN_CRON_INTERVAL_MS}ms, modo: ${getApiUrl() ? 'API' : 'dev'})`);
    runBurnSyncCycle().catch(err => console.error('[burnCron] ciclo inicial falhou:', err));
    setInterval(() => {
        runBurnSyncCycle().catch(err => console.error('[burnCron] ciclo falhou:', err));
    }, BURN_CRON_INTERVAL_MS);
}
