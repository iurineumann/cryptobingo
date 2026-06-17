import mongoose, { Schema, Document } from 'mongoose';

export interface DailyStreak {
    last_date: string;
    count: number;
}

export interface Progression {
    xp: number;
    level: number;
    tier: string;
    sub_level: number;
    games_played: number;
}

export interface PlayerProgressionDocument extends Document {
    wallet_address: string;
    progression: Progression;
    daily_streak: DailyStreak;
}

const PlayerProgressionSchema = new Schema({
    wallet_address: { type: String, required: true, unique: true, index: true },
    progression: {
        xp:           { type: Number, default: 0 },
        level:        { type: Number, default: 1 },
        tier:         { type: String, enum: ['Cobre','Bronze','Prata','Ouro','Platina','Esmeralda','Safira','Rubi','Diamante'], default: 'Cobre' },
        sub_level:    { type: Number, default: 1 },
        games_played: { type: Number, default: 0 },
    },
    daily_streak: {
        last_date: { type: String, default: '' },
        count:     { type: Number, default: 0 },
    },
}, { timestamps: true });

export const PlayerProgression = mongoose.models.PlayerProgression
    || mongoose.model<PlayerProgressionDocument>('PlayerProgression', PlayerProgressionSchema, 'userprofiles');
