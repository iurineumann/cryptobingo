// apps/worker-game-loop/src/services/chatSystemHelper.ts
// Envia mensagens de sistema ao chat via endpoint interno da API gateway.
// Falhas são silenciosas — chat de sistema não deve bloquear o fluxo do jogo.

import { fetchGame, rpcClient } from '@cryptobingo/blockchain-core';
import { Name, UInt64 }         from '@wharfkit/antelope';
import type { BlockchainTicketRecord } from '@cryptobingo/shared-types';

const API_GATEWAY_URL    = process.env.API_GATEWAY_URL    || 'http://localhost:8083';
const INTERNAL_API_KEY   = process.env.INTERNAL_API_KEY   || '';
const CONTRACT_ACCOUNT   = process.env.CONTRACT_ACCOUNT   || 'bingogamectr';
const TICKET_SCAN_LIMIT  = 250; // bolas suficientes para qualquer partida normal

type MessageType = 'system_draw' | 'system_status';

async function sendChatSystemMessage(
    roomId:       string,
    message:      string,
    message_type: MessageType = 'system_draw',
): Promise<void> {
    if (!roomId || roomId === '0' || !INTERNAL_API_KEY) return;

    const res = await fetch(`${API_GATEWAY_URL}/api/v1/internal/chat/system`, {
        method:  'POST',
        headers: {
            'Content-Type':   'application/json',
            'x-internal-key': INTERNAL_API_KEY,
        },
        body: JSON.stringify({ roomId, message, message_type }),
    });

    if (!res.ok) {
        console.warn(`[ChatSystem] HTTP ${res.status} ao enviar mensagem para sala ${roomId}`);
    }
}

/**
 * Conta cartelas e jogadores únicos varrendo a tabela tickets on-chain.
 * Tickets têm preço variável (ADR-028 descontos NFT), então não é possível
 * derivar a contagem de total_wagered / ticket_price.
 */
async function countTicketsAndPlayers(gameId: string): Promise<{ tickets: number; players: number }> {
    let lowerBound: string | undefined;
    let totalTickets = 0;
    const owners     = new Set<string>();
    let hasMore      = true;

    while (hasMore) {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       Name.from(UInt64.from(gameId)),
            table:       'tickets',
            key_type:    'i64',
            limit:       TICKET_SCAN_LIMIT,
            lower_bound: lowerBound as any,
            json:        true,
        });

        const rows = response.rows as BlockchainTicketRecord[];
        if (rows.length === 0) break;

        for (const t of rows) {
            totalTickets++;
            owners.add(t.owner);
        }

        hasMore = response.more === true && rows.length === TICKET_SCAN_LIMIT;
        if (hasMore) {
            lowerBound = (BigInt(rows[rows.length - 1].ticket_id) + 1n).toString();
        }
    }

    return { tickets: totalTickets, players: owners.size };
}

/**
 * Enviado após lockgame — payload estruturado para renderização i18n no frontend.
 */
export async function sendGameLockedMessage(gameId: string): Promise<void> {
    try {
        const game = await fetchGame(gameId);
        if (!game || game.room_id === '0') return;

        const { tickets, players } = await countTicketsAndPlayers(gameId);

        const payload = JSON.stringify({ code: 'GAME_LOCKED', tickets, players });
        await sendChatSystemMessage(game.room_id, payload, 'system_status');
    } catch (err) {
        console.warn(`[ChatSystem] Erro ao enviar mensagem de lock (jogo ${gameId}):`, err);
    }
}

/**
 * Enviado após o oráculo responder — payload estruturado para i18n no frontend.
 */
export async function sendDrawStartedMessage(roomId: string): Promise<void> {
    try {
        const payload = JSON.stringify({ code: 'DRAW_STARTED' });
        await sendChatSystemMessage(roomId, payload, 'system_draw');
    } catch (err) {
        console.warn(`[ChatSystem] Erro ao enviar mensagem de sorteio (sala ${roomId}):`, err);
    }
}

/**
 * Enviado após todos os reveals e pagamentos — payload estruturado para i18n no frontend.
 */
export async function sendGameSummaryMessage(roomId: string, totalWinners: number): Promise<void> {
    try {
        const payload = JSON.stringify({ code: 'GAME_SUMMARY', winners: totalWinners });
        await sendChatSystemMessage(roomId, payload, 'system_draw');
    } catch (err) {
        console.warn(`[ChatSystem] Erro ao enviar resumo (sala ${roomId}):`, err);
    }
}
