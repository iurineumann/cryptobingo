import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import ChatMessageModel from '../models/ChatMessage';
import RoomMetadataModel from '../models/RoomMetadata';
import { isTokenRevoked } from '../middleware/auth';
import {
    socketConnectionsActive,
    socketMessagesTotal,
    socketAuthFailuresTotal,
    socketRateLimitedTotal,
} from '../services/metrics';
import { createPresenceStore } from './presence';

// Reações permitidas — fora da lista é descartado (anti-abuso).
// Mantida no módulo apenas para leitura; estado mutável fica dentro de setupChatSocket.
const REACTION_EMOJIS = ['👏', '🔥', '😮', '😢', '🍀', '🎉'];

// WAX names: max 12 chars [a-z1-5.] — lookahead rejeita nomes mais longos
const MENTION_RE = /@([a-z1-5.]{1,12})(?![a-z1-5.])/gi;

export function extractMentions(message: string): string[] {
    const hits: string[] = [];
    let m: RegExpExecArray | null;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(message)) !== null) hits.push(m[1].toLowerCase());
    return [...new Set(hits)];
}

function toPayload(doc: InstanceType<typeof ChatMessageModel>) {
    return {
        id:             doc._id.toString(),
        wallet_address: doc.wallet_address,
        message:        doc.message,
        message_type:   doc.message_type,
        mentions:       doc.mentions,
        timestamp:      doc.timestamp instanceof Date
            ? doc.timestamp.toISOString()
            : String(doc.timestamp),
    };
}

// ── Validação de sala ────────────────────────────────────────────
async function roomExists(roomId: string): Promise<boolean> {
    const room = await RoomMetadataModel.findOne({ room_id: roomId }).lean();
    return room !== null;
}

export function setupChatSocket(io: Server): void {
    const chatNs = io.of('/chat');

    // ── Estado efêmero: isolado por instância para permitir reset em testes ──
    // Presença efêmera por sala (contada por wallet — multi-socket da mesma wallet = 1)
    const presence = createPresenceStore();

    // Rate-limit de mensagens de chat: max 5 msgs / 5s por wallet
    const RATE_WINDOW_MS = 5_000;
    const RATE_MAX       = 5;
    const rateBuckets    = new Map<string, { count: number; windowStart: number }>();

    function isRateLimited(wallet: string): boolean {
        const now    = Date.now();
        const bucket = rateBuckets.get(wallet);
        if (!bucket || now - bucket.windowStart >= RATE_WINDOW_MS) {
            rateBuckets.set(wallet, { count: 1, windowStart: now });
            return false;
        }
        if (bucket.count >= RATE_MAX) return true;
        bucket.count++;
        return false;
    }

    // Rate-limit de reações: max 10 / 5s por wallet
    const REACTION_WINDOW_MS = 5_000;
    const REACTION_MAX       = 10;
    const reactionBuckets    = new Map<string, { count: number; windowStart: number }>();

    function isReactionLimited(wallet: string): boolean {
        const now = Date.now();
        const b   = reactionBuckets.get(wallet);
        if (!b || now - b.windowStart >= REACTION_WINDOW_MS) {
            reactionBuckets.set(wallet, { count: 1, windowStart: now });
            return false;
        }
        if (b.count >= REACTION_MAX) return true;
        b.count++;
        return false;
    }

    // ── Autenticação: JWT + revogação Redis ──────────────────────
    chatNs.use(async (socket, next) => {
        const token = socket.handshake.auth.token as string | undefined;
        if (!token) return next(new Error('Não autenticado.'));
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
                wallet: string;
                jti?:   string;
                exp?:   number;
            };
            if (!payload.wallet) return next(new Error('Token inválido.'));

            if (payload.jti && await isTokenRevoked(payload.jti)) {
                return next(new Error('Token revogado.'));
            }

            socket.data.wallet = payload.wallet;
            socket.data.jti    = payload.jti;

            // Desconecta automaticamente quando o token expirar
            if (payload.exp) {
                const msUntilExpiry = payload.exp * 1000 - Date.now();
                if (msUntilExpiry > 0) {
                    setTimeout(() => socket.disconnect(true), msUntilExpiry);
                } else {
                    return next(new Error('Token expirado.'));
                }
            }

            next();
        } catch {
            socketAuthFailuresTotal.inc();
            next(new Error('Token inválido.'));
        }
    });

    chatNs.on('connection', socket => {
        socketConnectionsActive.inc();

        // Rastreia salas em que este socket entrou para limpar presença no disconnect
        const joinedRooms = new Set<string>();

        // Handler unificado de disconnect: decrementa conexões + limpa presença em todas as salas
        socket.on('disconnect', () => {
            socketConnectionsActive.dec();
            const wallet = socket.data.wallet as string;
            for (const roomId of joinedRooms) {
                presence.remove(roomId, wallet);
                chatNs.to(roomId).emit('presence:update', { roomId, online: presence.count(roomId) });
            }
        });

        socket.on('chat:join', async ({ roomId }: { roomId: string }) => {
            socketMessagesTotal.inc({ event: 'chat:join' });
            if (!roomId) return;
            if (!await roomExists(roomId)) return;
            // Idempotência: re-join do mesmo socket na mesma sala (reconnect/remount do useChat)
            // não infla a presença. Rejoin legítimo após chat:leave funciona (joinedRooms.delete).
            if (joinedRooms.has(roomId)) return;
            socket.join(roomId);
            joinedRooms.add(roomId);
            presence.add(roomId, socket.data.wallet as string);
            chatNs.to(roomId).emit('presence:update', { roomId, online: presence.count(roomId) });
        });

        socket.on('chat:leave', ({ roomId }: { roomId: string }) => {
            socketMessagesTotal.inc({ event: 'chat:leave' });
            if (!roomId) return;
            socket.leave(roomId);
            joinedRooms.delete(roomId);
            presence.remove(roomId, socket.data.wallet as string);
            chatNs.to(roomId).emit('presence:update', { roomId, online: presence.count(roomId) });
        });

        socket.on('reaction:send', ({ roomId, emoji }: { roomId?: string; emoji?: string }) => {
            socketMessagesTotal.inc({ event: 'reaction:send' });
            if (!roomId || !emoji || !REACTION_EMOJIS.includes(emoji)) return;
            const wallet = socket.data.wallet as string;
            if (isReactionLimited(wallet)) {
                socketRateLimitedTotal.inc();
                return;
            }
            chatNs.to(roomId).emit('reaction:new', { wallet, emoji, ts: Date.now() });
        });

        socket.on('chat:send', async ({ roomId, message }: { roomId?: string; message?: string }) => {
            socketMessagesTotal.inc({ event: 'chat:send' });
            const trimmed = (message ?? '').trim().slice(0, 500);
            if (!trimmed || !roomId) return;

            const wallet = socket.data.wallet as string;

            if (isRateLimited(wallet)) {
                socketRateLimitedTotal.inc();
                socket.emit('chat:error', { code: 'RATE_LIMITED', message: 'Muitas mensagens. Aguarde.' });
                return;
            }

            if (!await roomExists(roomId)) return;

            try {
                const doc = await ChatMessageModel.create({
                    lobby_id:       roomId,
                    wallet_address: wallet,
                    message:        trimmed,
                    message_type:   'user',
                    mentions:       extractMentions(trimmed),
                    timestamp:      new Date(),
                });
                chatNs.to(roomId).emit('chat:message', toPayload(doc));
            } catch (err) {
                console.error('[chatSocket] Erro ao salvar mensagem:', err);
            }
        });
    });
}
