import { Request, Response } from 'express';
import ChatMessageModel from '../models/ChatMessage';
import { getIo } from '../socket';

export async function getChatHistory(req: Request, res: Response) {
    const { roomId } = req.params;
    const limit  = Math.min(parseInt(req.query.limit  as string) || 30, 200);
    const before = req.query.before as string | undefined;

    const filter: Record<string, unknown> = { lobby_id: roomId };
    if (before) filter.timestamp = { $lt: new Date(before) };

    const docs = await ChatMessageModel
        .find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

    const hasMore = docs.length === limit;

    res.json({
        messages: docs.reverse().map(d => ({
            id:             d._id.toString(),
            wallet_address: d.wallet_address,
            message:        d.message,
            message_type:   d.message_type ?? 'user',
            mentions:       d.mentions ?? [],
            timestamp:      d.timestamp instanceof Date ? d.timestamp.toISOString() : String(d.timestamp),
        })),
        hasMore,
    });
}

export async function saveChatMessage(req: Request, res: Response) {
    const { roomId } = req.params;
    const wallet_address = req.user!.wallet;
    const { message } = req.body;

    if (!message) {
        res.status(400).json({ error: 'message obrigatório.' });
        return;
    }

    const doc = await ChatMessageModel.create({
        lobby_id:       roomId,
        wallet_address,
        message:        (message as string).slice(0, 500),
        message_type:   'user',
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

    // Broadcast para players conectados via WS (mensagens de sistema do worker)
    getIo()?.of('/chat').to(roomId).emit('chat:message', payload);

    res.status(201).json(payload);
}
