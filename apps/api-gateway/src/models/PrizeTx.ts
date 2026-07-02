import mongoose, { Schema, Document } from 'mongoose';
import type { PrizeTx as IPrizeTx } from '@cryptobingo/shared-types';

export interface PrizeTxDocument extends Omit<IPrizeTx, 'claimedAt'>, Document {
    claimedAt: Date;
}

const PrizeTxSchema = new Schema<PrizeTxDocument>(
    {
        gameId:    { type: String, required: true, index: true },
        account:   { type: String, required: true, index: true },
        ticketId:  { type: String, required: true },
        winType:   { type: String, enum: ['pattern', 'combo', 'stage'], required: true },
        patternMask:  String,
        comboId:      Number,
        stageNumber:  Number,
        winLabel:     { type: String, required: true },
        weight:       { type: Number, required: true },
        amount:       { type: String, required: true },
        currency:     { type: String, required: true },
        transactionId: String,
        goldenMultiplier: { type: Number, default: 1 },
        ticketPrice:  { type: String, required: true },
        claimedAt:    { type: Date, required: true },
    },
    { timestamps: true },
);

PrizeTxSchema.index({ gameId: 1, ticketId: 1, winType: 1 }, { unique: true });

export const PrizeTx = mongoose.model<PrizeTxDocument>('PrizeTx', PrizeTxSchema);
export default PrizeTx;
