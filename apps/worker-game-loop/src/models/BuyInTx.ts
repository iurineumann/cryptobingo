import mongoose, { Schema, Document } from 'mongoose';
import type { BuyInTx as IBuyInTx } from '@cryptobingo/shared-types';

export interface BuyInTxDocument extends Omit<IBuyInTx, 'purchasedAt'>, Document {
    purchasedAt: Date;
}

const BuyInTxSchema = new Schema<BuyInTxDocument>(
    {
        gameId:   { type: String, required: true, index: true },
        account:  { type: String, required: true, index: true },
        ticketId: { type: String, required: true },
        amount:   { type: String, required: true },
        currency: { type: String, required: true },
        purchasedAt: { type: Date, required: true },
    },
    { timestamps: true },
);

BuyInTxSchema.index({ gameId: 1, ticketId: 1 }, { unique: true });

export const BuyInTx = mongoose.model<BuyInTxDocument>('BuyInTx', BuyInTxSchema);
export default BuyInTx;
