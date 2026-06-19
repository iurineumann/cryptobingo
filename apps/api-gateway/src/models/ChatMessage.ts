import mongoose, { Schema, Document } from 'mongoose';

export type MessageType = 'user' | 'system_draw' | 'system_drop' | 'system_status';

export interface ChatMessageDocument extends Document {
    lobby_id:       string;
    wallet_address: string;
    message:        string;
    message_type:   MessageType;
    mentions:       string[];
    timestamp:      Date;
}

const ChatMessageSchema = new Schema({
    lobby_id:       { type: String, required: true, index: true },
    wallet_address: { type: String, required: true },
    message:        { type: String, required: true, maxlength: 500 },
    message_type:   { type: String, enum: ['user', 'system_draw', 'system_drop', 'system_status'], default: 'user' },
    mentions:       { type: [String], default: [] },
    timestamp:      { type: Date, default: Date.now },
}, { timestamps: false });

ChatMessageSchema.index({ lobby_id: 1, timestamp: -1 });

export const ChatMessageModel = mongoose.model<ChatMessageDocument>('ChatMessage', ChatMessageSchema);
export default ChatMessageModel;
