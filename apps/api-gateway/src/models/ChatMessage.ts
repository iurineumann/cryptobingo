import mongoose, { Schema, Document } from 'mongoose';

export interface ChatMessageDocument extends Document {
    lobby_id:        string;
    wallet_address:  string;
    message:         string;
    is_sponsor_drop: boolean;
    timestamp:       Date;
}

const ChatMessageSchema = new Schema({
    lobby_id:        { type: String, required: true, index: true },
    wallet_address:  { type: String, required: true },
    message:         { type: String, required: true, maxlength: 500 },
    is_sponsor_drop: { type: Boolean, default: false },
    timestamp:       { type: Date, default: Date.now },
}, { timestamps: false });

ChatMessageSchema.index({ lobby_id: 1, timestamp: -1 });

export const ChatMessageModel = mongoose.model<ChatMessageDocument>('ChatMessage', ChatMessageSchema);
export default ChatMessageModel;
