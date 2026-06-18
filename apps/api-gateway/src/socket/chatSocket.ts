import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import ChatMessageModel from '../models/ChatMessage';

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

export function setupChatSocket(io: Server): void {
    const chatNs = io.of('/chat');

    chatNs.use((socket, next) => {
        const token = socket.handshake.auth.token as string | undefined;
        if (!token) return next(new Error('Não autenticado.'));
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET!) as { wallet: string };
            if (!payload.wallet) return next(new Error('Token inválido.'));
            socket.data.wallet = payload.wallet;
            next();
        } catch {
            next(new Error('Token inválido.'));
        }
    });

    chatNs.on('connection', socket => {
        socket.on('chat:join', ({ roomId }: { roomId: string }) => {
            if (roomId) socket.join(roomId);
        });

        socket.on('chat:leave', ({ roomId }: { roomId: string }) => {
            if (roomId) socket.leave(roomId);
        });

        socket.on('chat:send', async ({ roomId, message }: { roomId?: string; message?: string }) => {
            const trimmed = (message ?? '').trim().slice(0, 500);
            if (!trimmed || !roomId) return;

            try {
                const doc = await ChatMessageModel.create({
                    lobby_id:       roomId,
                    wallet_address: socket.data.wallet as string,
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
