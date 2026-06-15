import { Request, Response } from 'express';
import ChatMessageModel from '../models/ChatMessage';

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
            id:              d._id.toString(),
            wallet_address:  d.wallet_address,
            message:         d.message,
            is_sponsor_drop: d.is_sponsor_drop,
            timestamp:       d.timestamp instanceof Date ? d.timestamp.toISOString() : String(d.timestamp),
        })),
        hasMore,
    });
}

export async function saveChatMessage(req: Request, res: Response) {
    const { roomId } = req.params;
    const { wallet_address, message, is_sponsor_drop } = req.body;

    if (!wallet_address || !message) {
        res.status(400).json({ error: 'wallet_address e message obrigatórios.' });
        return;
    }

    const doc = await ChatMessageModel.create({
        lobby_id: roomId,
        wallet_address,
        message: message.slice(0, 500),
        is_sponsor_drop: !!is_sponsor_drop,
        timestamp: new Date(),
    });

    res.status(201).json({
        id: doc._id.toString(),
        lobby_id: doc.lobby_id,
        wallet_address: doc.wallet_address,
        message: doc.message,
        is_sponsor_drop: doc.is_sponsor_drop,
        timestamp: doc.timestamp.toISOString(),
    });
}
