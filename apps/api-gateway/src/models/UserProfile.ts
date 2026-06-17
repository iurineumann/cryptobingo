// apps/api-gateway/src/models/UserProfile.ts
import mongoose, { Schema, Document } from 'mongoose';
import type { MongoUserProfile, UserRole } from '@cryptobingo/shared-types';

export interface UserProfileDocument extends MongoUserProfile, Document {
    role: UserRole;
}

const UserProfileSchema = new Schema({
    wallet_address: { type: String, required: true, unique: true, index: true },
    nickname:       { type: String, default: 'Player' },
    avatar_nft_asset_id: { type: String, default: null },

    // RBAC — role do usuário (padrão: 'player')
    // Promover para 'admin' diretamente no MongoDB:
    //   db.userprofiles.updateOne({ wallet_address: 'mywallet' }, { $set: { role: 'admin' } })
    role: {
        type:    String,
        enum:    ['player', 'moderator', 'sponsor', 'admin', 'contract_admin'],
        default: 'player',
        index:   true,
    },

    preferences: {
        locale: {
            type:    String,
            enum:    ['en-US', 'pt-BR', 'es-ES', 'fr-FR', 'ru-RU', 'zh-CN', 'ja-JP'],
            default: 'en-US',
        },
        currency_display: { type: String,  default: 'WAX' },
        sound_enabled:    { type: Boolean, default: true  },
    },

    progression: {
        xp:           { type: Number, default: 0 },
        tier:         {
            type: String,
            enum: ['Cobre', 'Bronze', 'Prata', 'Ouro', 'Platina', 'Esmeralda', 'Safira', 'Rubi', 'Diamante'],
            default: 'Cobre',
        },
        level:        { type: Number, default: 1 },
        sub_level:    { type: Number, default: 1 },
        games_played: { type: Number, default: 0 },
    },
}, { timestamps: true });

export const UserProfile = mongoose.model<UserProfileDocument>('UserProfile', UserProfileSchema);
export default UserProfile;
