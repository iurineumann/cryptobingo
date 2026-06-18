import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import ChatMessageModel from '../models/ChatMessage';
import RoomMetadataModel from '../models/RoomMetadata';
import { isTokenRevoked } from '../middleware/auth';

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

// ── Rate limiter: token bucket por wallet ────────────────────────
// Max 5 mensagens por janela de 5 segundos por wallet
const RATE_WINDOW_MS  = 5_000;
const RATE_MAX        = 5;
const rateBuckets     = new Map<string, { count: number; windowStart: number }>();

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

// ── Validação de sala ────────────────────────────────────────────
async function roomExists(roomId: string): Promise<boolean> {
    const room = await RoomMetadataModel.findOne({ room_id: roomId }).lean();
    return room !== null;
}

export function setupChatSocket(io: Server): void {
    const chatNs = io.of('/chat');

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
            next(new Error('Token inválido.'));
        }
    });

    chatNs.on('connection', socket => {
        socket.on('chat:join', async ({ roomId }: { roomId: string }) => {
            if (!roomId) return;
            if (!await roomExists(roomId)) return;
            socket.join(roomId);
        });

        socket.on('chat:leave', ({ roomId }: { roomId: string }) => {
            if (roomId) socket.leave(roomId);
        });

        socket.on('chat:send', async ({ roomId, message }: { roomId?: string; message?: string }) => {
            const trimmed = (message ?? '').trim().slice(0, 500);
            if (!trimmed || !roomId) return;

            const wallet = socket.data.wallet as string;

            if (isRateLimited(wallet)) {
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
