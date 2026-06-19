import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import ChatMessageModel from '../models/ChatMessage';
import { getIo } from '../socket';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY;

export function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
    const key = req.headers['x-internal-key'];
    if (!INTERNAL_KEY || typeof key !== 'string') {
        res.status(403).json({ error: 'Acesso interno negado.' });
        return;
    }
    try {
        const a = Buffer.from(key);
        const b = Buffer.from(INTERNAL_KEY);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
            res.status(403).json({ error: 'Acesso interno negado.' });
            return;
        }
    } catch {
        res.status(403).json({ error: 'Acesso interno negado.' });
        return;
    }
    next();
}

export async function createSystemChatMessage(req: Request, res: Response) {

    const { roomId, message, message_type } = req.body;

    if (!roomId || !message || !message_type) {
        res.status(400).json({ error: 'roomId, message e message_type obrigatórios.' });
        return;
    }

    const validTypes = ['user', 'system_draw', 'system_drop', 'system_status'];
    if (!validTypes.includes(message_type)) {
        res.status(400).json({ error: `message_type inválido. Válidos: ${validTypes.join(', ')}` });
        return;
    }

    const doc = await ChatMessageModel.create({
        lobby_id:       roomId,
        wallet_address: 'system',
        message:        String(message).slice(0, 500),
        message_type,
        mentions:       [],
        timestamp:      new Date(),
    });

    const payload = {
        id:             doc._id.toString(),
        wallet_address: doc.wallet_address,
        message:        doc.message,
        message_type:   doc.message_type,
        mentions:       doc.mentions,
        timestamp:      doc.timestamp.toISOString(),
    };

    getIo()?.of('/chat').to(roomId).emit('chat:message', payload);

    res.status(201).json(payload);
}
