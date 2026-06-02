// apps/api-gateway/src/controllers/ticketController.ts
// Ref: ADR-001 (Assinatura Contextual Anti-Replay), SPEC.md §3.1 (RNG), §2.1 (buytickets)

import { Request, Response } from 'express';
import crypto from 'crypto';
import { Name, PrivateKey, Checksum256 } from '@wharfkit/antelope';
import { fetchGame } from '@cryptobingo/blockchain-core';
import { redisClient } from '../database/redis';

// ==========================================
// CONFIGURAÇÃO
// ==========================================

// Distribuição BINGO: cada coluna define o range válido de números.
// Ref: SPEC.md §3.1 — P(15,5) = 360.360 variações por coluna (Fisher-Yates).
const BINGO_COLUMNS: [number, number][] = [
    [1,  15],  // B
    [16, 30],  // I
    [31, 45],  // N
    [46, 60],  // G
    [61, 75],  // O
];

const MAX_TICKETS_PER_REQUEST = 50; // Limite por chamada para evitar CPU abuse

// ==========================================
// FUNÇÕES PURAS — TESTÁVEIS ISOLADAMENTE
// ==========================================

/**
 * Fisher-Yates Shuffle em um array.
 * Utiliza crypto.randomInt para garantia criptográfica de uniformidade.
 * Ref: SPEC.md §3.1 — "O algoritmo de geração aplica o Fisher-Yates Shuffle."
 */
function fisherYatesShuffle(arr: number[]): number[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Gera uma matriz de bingo como array plano de 24 posições (exclui FREE SPACE na pos 12).
 *
 * Ordem de serialização: coluna-maior [B0-B4, I0-I4, N0,N1,N3,N4, G0-G4, O0-O4].
 * A posição 12 (FREE SPACE no bit layout) é pulada — coluna N emite apenas 4 números.
 * Ref: SPEC.md §1.3 — "Exatas 24 posições ordinais, pulando o 12 correspondente ao FREE SPACE."
 *
 * Layout de bits da cartela 5x5 (avaliador usa este mapeamento):
 *   Col:  B    I    N    G    O
 *  Row0: [0]  [5]  [10] [15] [20]
 *  Row1: [1]  [6]  [11] [16] [21]
 *  Row2: [2]  [7] [12*] [17] [22]   (* FREE SPACE — omitido da matrix)
 *  Row3: [3]  [8]  [13] [18] [23]
 *  Row4: [4]  [9]  [14] [19] [24]
 */
function generateBingoMatrix(): number[] {
    const matrix: number[] = [];

    for (let col = 0; col < 5; col++) {
        const [min, max] = BINGO_COLUMNS[col];
        const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
        const shuffled = fisherYatesShuffle(pool);
        const selected = shuffled.slice(0, 5);

        if (col !== 2) {
            // Colunas B, I, G, O: 5 números completos
            matrix.push(...selected);
        } else {
            // Coluna N (col=2): FREE SPACE no row 2 — emite rows 0,1,3,4 (pula row 2)
            // matrix[10]=N_row0, matrix[11]=N_row1, matrix[12]=N_row3, matrix[13]=N_row4
            matrix.push(selected[0], selected[1], selected[3], selected[4]);
        }
    }

    // Garantia: deve ter exatamente 24 posições
    if (matrix.length !== 24) {
        throw new Error(`[TicketGen] Invariante violada: matrix.length=${matrix.length} (esperado 24)`);
    }

    return matrix;
}

function encodeName(accountName: string): Buffer {
    const n = Name.from(accountName);
    const buf = Buffer.allocUnsafe(8);
    buf.writeBigUInt64LE(BigInt(n.value.toString()));
    return buf;
}

/**
 * Codifica varuint32 (unsigned LEB128) usado pelo eosio::datastream.
 */
function encodeVaruint32(value: number): Buffer {
    const bytes: number[] = [];
    while (value >= 0x80) {
        bytes.push((value & 0x7f) | 0x80);
        value >>>= 7;
    }
    bytes.push(value & 0x7f);
    return Buffer.from(bytes);
}

/**
 * Calcula o hash SHA-256 contextual de uma cartela para assinatura anti-replay.
 *
 * Serialização determinística equivalente ao eosio::datastream do C++:
 *   [ unsigned_int(matrix.size()) ][ matrix bytes ][ game_id(uint64 LE) ][ buyer(name uint64 LE) ]
 *
 * Deve ser idêntico a:
 *   size_t buf_size = pack_size(matrices[i]) + sizeof(uint64_t) + sizeof(name);
 *   vector<char> buffer(buf_size);
 *   datastream ds(buffer.data(), buffer.size());
 *   ds << matrices[i] << game_id << buyer;
 *   auto hash = sha256(buffer.data(), buffer.size());
 *
 * Ref: ADR-001, contract: bingo.cpp buytickets()
 */
function computeTicketHash(matrix: number[], gameId: string, accountName: string): Checksum256 {
    // 1. Matrix: unsigned_int(size) + raw bytes (pack_size = varuint32 + N)
    const rawMatrix = Buffer.from(new Uint8Array(matrix));
    const sizePrefix = encodeVaruint32(matrix.length);
    const matrixBuf = Buffer.concat([sizePrefix, rawMatrix]);

    // 2. game_id: uint64 little-endian (8 bytes)
    const gameIdBuf = Buffer.allocUnsafe(8);
    gameIdBuf.writeBigUInt64LE(BigInt(gameId));

    // 3. account name: uint64 LE (EOSIO name encoding, fixed 8 bytes)
    const nameBuf = encodeName(accountName);

    // 4. Concatenação e hash
    const payload = Buffer.concat([matrixBuf, gameIdBuf, nameBuf]);
    return Checksum256.hash(payload);
}

/**
 * Gera a chave Redis para dedupe de matrizes por rodada.
 * Formato: game:{gameId}:matrix:{sha256_da_matrix}
 * Ref: SPEC.md §3.2 — estrutura de chaves Redis do sistema.
 */
function matrixRedisKey(gameId: string, matrix: number[]): string {
    const hash = crypto
        .createHash('sha256')
        .update(Buffer.from(new Uint8Array(matrix)))
        .digest('hex');
    return `game:${gameId}:matrix:${hash}`;
}

// ==========================================
// CONTROLLER
// ==========================================

/**
 * POST /api/v1/games/:gameId/tickets/generate
 *
 * Gera N cartelas assinadas pelo microserviço para o usuário autenticado.
 * O Frontend envia o resultado diretamente para buytickets() no Smart Contract.
 *
 * Fluxo:
 *   1. Valida gameId e status on-chain (deve ser 'funding')
 *   2. Para cada cartela (até count):
 *      a. Gera matriz 5x5 com Fisher-Yates por coluna
 *      b. Valida unicidade na rodada via Redis SET NX (atômico)
 *      c. Computa SHA256(matrix + game_id + account_name)
 *      d. Assina o hash com MICROSERVICE_PRIVATE_KEY (Antelope ECDSA K1)
 *   3. Retorna { game_id, account, count, tickets: [{ matrix, signature }] }
 *
 * Body:  { count: number } (1–50)
 * Auth:  Bearer JWT — requireAuth injeta req.user.wallet
 * Ref:   ADR-001, SPEC.md §2.1, §3.1
 */
export async function generateTickets(req: Request, res: Response): Promise<void> {
    const { gameId } = req.params;
    const accountName = req.body.account || req.user!.wallet;
    const rawCount = req.body.count;
    const count = Number(rawCount ?? 1);

    // ─── Validação de entrada ─────────────────────────────────────────────────

    if (!gameId || !/^\d+$/.test(gameId)) {
        res.status(400).json({ error: 'Parâmetro game_id inválido. Deve ser um inteiro positivo.' });
        return;
    }

    if (accountName !== req.user!.wallet) {
        console.warn(
            `[TicketGen] account "${accountName}" difere do JWT wallet "${req.user!.wallet}"`
        );
    }

    if (!/^[a-z1-5.]{1,13}$/.test(accountName)) {
        res.status(400).json({ error: 'Campo "account" inválido.' });
        return;
    }

    if (!Number.isInteger(count) || count < 1 || count > MAX_TICKETS_PER_REQUEST) {
        res.status(400).json({
            error: `Campo "count" deve ser um inteiro entre 1 e ${MAX_TICKETS_PER_REQUEST}.`,
        });
        return;
    }

    const MICROSERVICE_PRIVATE_KEY = process.env.MICROSERVICE_PRIVATE_KEY;
    if (!MICROSERVICE_PRIVATE_KEY) {
        console.error('❌ [TicketGen] MICROSERVICE_PRIVATE_KEY não definida no .env!');
        res.status(500).json({ error: 'Configuração interna ausente. Contate o suporte.' });
        return;
    }

    // ─── Validação do estado do jogo on-chain ─────────────────────────────────
    // SPEC.md §2.1: buytickets só é válido com status == 'funding'

    let game;
    try {
        game = await fetchGame(gameId);
    } catch (err) {
        console.error(`[TicketGen] Erro RPC ao buscar jogo ${gameId}:`, err);
        res.status(503).json({
            error: 'Nó blockchain indisponível. Tente novamente em instantes.',
        });
        return;
    }

    if (!game) {
        res.status(404).json({ error: `Jogo ${gameId} não encontrado na blockchain.` });
        return;
    }

    if (game.status !== 'funding') {
        res.status(409).json({
            error: `Compra de cartelas indisponível. Status atual do jogo: "${game.status}".`,
            status: game.status,
        });
        return;
    }

    // ─── Carrega a chave privada do microserviço ──────────────────────────────

    let privateKey: PrivateKey;
    try {
        privateKey = PrivateKey.from(MICROSERVICE_PRIVATE_KEY);
    } catch {
        console.error('[TicketGen] MICROSERVICE_PRIVATE_KEY com formato inválido.');
        res.status(500).json({ error: 'Chave do microserviço inválida.' });
        return;
    }

    // ─── Geração das cartelas ─────────────────────────────────────────────────

    const tickets: Array<{ matrix: number[]; signature: string }> = [];
    let attempts = 0;
    const MAX_ATTEMPTS = count * 10; // Janela de segurança contra colisões excessivas

    while (tickets.length < count && attempts < MAX_ATTEMPTS) {
        attempts++;

        let matrix: number[];
        try {
            matrix = generateBingoMatrix();
        } catch (err) {
            console.error('[TicketGen] Erro ao gerar matriz:', err);
            res.status(500).json({ error: 'Erro interno na geração de cartelas.' });
            return;
        }

        // Valida unicidade via Redis SET NX (atômico — fail-safe se Redis indisponível)
        // TTL de 86400s (24h) alinhado ao ciclo de vida do jogo — SPEC.md §5.1
        const redisKey = matrixRedisKey(gameId, matrix);
        let isUnique = true;

        try {
            const result = await redisClient.set(redisKey, '1', { EX: 86400, NX: true });
            isUnique = result === 'OK';
        } catch (redisErr) {
            // Fail-open controlado: Redis indisponível não bloqueia o fluxo.
            // O Smart Contract garante unicidade via ticket_id único.
            console.warn('[TicketGen] Redis indisponível para dedupe — prosseguindo:', redisErr);
            isUnique = true;
        }

        if (!isUnique) {
            console.warn(`[TicketGen] Colisão de matriz detectada (jogo ${gameId}), regerando...`);
            continue;
        }

        // Computa hash contextual e assina com chave do microserviço
        const digest = computeTicketHash(matrix, gameId, accountName);
        const signature = privateKey.signDigest(digest);

        tickets.push({
            matrix,
            signature: signature.toString(), // Formato: "SIG_K1_..."
        });
    }

    // ─── Verificação pós-geração ──────────────────────────────────────────────

    if (tickets.length < count) {
        // Situação improvável: colisões excessivas ou Redis sobrecarregado
        console.error(
            `[TicketGen] Falha parcial: geradas ${tickets.length}/${count} cartelas ` +
            `após ${attempts} tentativas (jogo ${gameId}, conta ${accountName})`
        );
        res.status(500).json({
            error: 'Não foi possível gerar todas as cartelas únicas. Tente novamente.',
            generated: tickets.length,
            requested: count,
        });
        return;
    }

    console.log(
        `✅ [TicketGen] ${tickets.length} cartela(s) gerada(s) — ` +
        `conta: ${accountName}, jogo: ${gameId}, tentativas: ${attempts}`
    );

    res.status(200).json({
        game_id: gameId,
        account: accountName,
        count: tickets.length,
        tickets,
    });
}
