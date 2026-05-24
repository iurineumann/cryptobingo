import mongoose, { Schema, Document } from 'mongoose';
import type { MongoUserProfile } from '@cryptobingo/shared-types';

// Usamos as tipagens que já criamos no nosso monorepo!
export interface UserProfileDocument extends MongoUserProfile, Document {}

const UserProfileSchema = new Schema({
    wallet_address: { type: String, required: true, unique: true, index: true },
    nickname: { type: String, default: 'Player' },
    avatar_nft_asset_id: { type: String, default: null },
    preferences: {
        locale: { 
            type: String, 
            enum: ['en-US', 'pt-BR', 'es-ES', 'fr-FR', 'ru-RU', 'zh-CN', 'ja-JP'], 
            default: 'en-US' 
        },
        currency_display: { type: String, default: 'WAX' },
        sound_enabled: { type: Boolean, default: true }
    },
    progression: {
        xp: { type: Number, default: 0 },
        tier: { type: String, enum: ['Bronze', 'Silver', 'Gold', 'Diamond'], default: 'Bronze' },
        games_played: { type: Number, default: 0 }
    }
}, { timestamps: true });

export default mongoose.model<UserProfileDocument>('UserProfile', UserProfileSchema);