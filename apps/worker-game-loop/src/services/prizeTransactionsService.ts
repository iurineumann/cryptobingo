import { PrizeTx } from '../models/PrizeTx';
import { BuyInTx } from '../models/BuyInTx';

export async function savePrizeTx(input: Record<string, unknown>): Promise<unknown> {
    const filter = {
        gameId:   input.gameId as string,
        ticketId: input.ticketId as string,
        winType:  input.winType as string,
    };
    return PrizeTx.findOneAndUpdate(filter, { $setOnInsert: input }, { upsert: true, new: true }).lean();
}

export async function saveBuyInTx(input: Record<string, unknown>): Promise<unknown> {
    const filter = {
        gameId:   input.gameId as string,
        ticketId: input.ticketId as string,
    };
    return BuyInTx.findOneAndUpdate(filter, { $setOnInsert: input }, { upsert: true, new: true }).lean();
}
