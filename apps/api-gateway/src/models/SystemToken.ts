import mongoose, { Schema, Document } from 'mongoose';

export interface SystemTokenDocument extends Document {
    contract:  string;
    symbol:    string;
    precision: number;
    label:     string;
    is_native: boolean; // true = WAX (eosio.token), exibe saldo get_account
    enabled:   boolean;
}

const SystemTokenSchema = new Schema({
    contract:  { type: String, required: true },
    symbol:    { type: String, required: true },
    precision: { type: Number, required: true, min: 0, max: 18, default: 4 },
    label:     { type: String, required: true },
    is_native: { type: Boolean, default: false },
    enabled:   { type: Boolean, default: true },
}, { timestamps: true });

SystemTokenSchema.index({ contract: 1, symbol: 1 }, { unique: true });

export const SystemToken = mongoose.model<SystemTokenDocument>('SystemToken', SystemTokenSchema);
export default SystemToken;
