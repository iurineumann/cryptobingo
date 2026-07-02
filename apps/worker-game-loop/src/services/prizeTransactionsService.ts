import type { PrizeTx as IPrizeTx, BuyInTx as IBuyInTx } from '@cryptobingo/shared-types';
import { PrizeTx } from '../models/PrizeTx';
import { BuyInTx } from '../models/BuyInTx';

export async function savePrizeTx(input: Partial<IPrizeTx>): Promise<unknown> {
    return PrizeTx.findOneAndUpdate(
        { gameId: input.gameId, ticketId: input.ticketId, winType: input.winType },
        { $setOnInsert: input },
        { upsert: true, new: true },
    ).lean();
}

export async function saveBuyInTx(input: Partial<IBuyInTx>): Promise<unknown> {
    return BuyInTx.findOneAndUpdate(
        { gameId: input.gameId, ticketId: input.ticketId },
        { $setOnInsert: input },
        { upsert: true, new: true },
    ).lean();
}
