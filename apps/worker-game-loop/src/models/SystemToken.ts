import mongoose, { Schema, Document } from 'mongoose';

// Spec do token do sistema (cadastro oficial, espelhado do api-gateway).
// Fonte autoritativa de `precision` por símbolo — NÃO hardcodar no indexer.
export interface SystemTokenDocument extends Document {
    contract:  string;
    symbol:    string;
    precision: number;
    label:     string;
    is_native: boolean;
    enabled:   boolean;
}

const SystemTokenSchema = new Schema<SystemTokenDocument>({
    contract:  { type: String, required: true },
    symbol:    { type: String, required: true },
    precision: { type: Number, required: true },
    label:     { type: String, required: true },
    is_native: { type: Boolean, default: false },
    enabled:   { type: Boolean, default: true },
}, { timestamps: true, collection: 'systemtokens' });

SystemTokenSchema.index({ contract: 1, symbol: 1 }, { unique: true });

export const SystemToken = mongoose.model<SystemTokenDocument>('SystemToken', SystemTokenSchema);
export default SystemToken;
