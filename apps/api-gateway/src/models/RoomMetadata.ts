import mongoose, { Schema, Document } from 'mongoose';
import type { RoomMetadata } from '@cryptobingo/shared-types';

export interface RoomMetadataDocument extends RoomMetadata, Document {}

const RoomDropConfigSchema = new Schema({
    token_contract:    { type: String },
    symbol:            { type: String },
    amount:            { type: String },
    template_id:       { type: Number },
    collection_name:   { type: String },
    drop_chance_pct:   { type: Number, required: true, min: 0, max: 100 },
    max_drops_per_game: { type: Number, required: true, min: 1 },
}, { _id: false });

const RoomMetadataSchema = new Schema({
    room_id:              { type: String, required: true, unique: true, index: true },
    name:                 { type: String, default: '' },
    description:          { type: String, default: '' },
    cover_image_url:       { type: String, default: '' },
    rules_summary:        { type: String, default: '' },
    chat_enabled:         { type: Boolean, default: true },
    auto_start_delay_sec: { type: Number, default: 30, min: 5 },
    drops:                { type: [RoomDropConfigSchema], default: [] },
}, { timestamps: true });

export const RoomMetadataModel = mongoose.model<RoomMetadataDocument>('RoomMetadata', RoomMetadataSchema);
export default RoomMetadataModel;
