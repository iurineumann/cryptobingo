// apps/api-gateway/src/models/GametypeMetadata.ts
// Metadados off-chain complementares aos gametypes on-chain.
// Armazena tipo dos patterns (simple/special/master) e combinações pagantes.
import mongoose, { Schema, Document } from 'mongoose';
import type { PatternType } from '@cryptobingo/shared-types';

export interface CombinationClauseDoc {
    type:         string;
    pattern_ids?: string[];
    pattern_type?: string;
    count?:       number;
}

export interface CombinationRuleDoc {
    name:     string;
    weight:   number;
    clauses:  CombinationClauseDoc[];
}

export interface GametypeMetadataDocument extends Document {
    gametype_id:  string;
    rules:        Array<{ pattern_id: string; weight: number; type: PatternType }>;
    combinations: CombinationRuleDoc[];
}

const RuleExtendedSchema = new Schema({
    pattern_id: { type: String, required: true },
    weight:     { type: Number, required: true, min: 100, max: 25500 },
    type:       { type: String, enum: ['simple', 'special', 'master'], required: true },
}, { _id: false });

const ClauseSubSchema = new Schema({
    type:         { type: String, enum: ['all_of', 'any_of', 'n_of_type'], required: true },
    pattern_ids:  { type: [String], default: undefined },
    pattern_type: { type: String, enum: ['simple', 'special', 'master'], default: undefined },
    count:        { type: Number, default: undefined },
}, { _id: false });

const CombinationSchema = new Schema({
    name:    { type: String, required: true },
    weight:  { type: Number, required: true, min: 100 },
    clauses: { type: [ClauseSubSchema], required: true },
}, { _id: false });

const GametypeMetadataSchema = new Schema({
    gametype_id:  { type: String, required: true, unique: true, index: true },
    rules:        { type: [RuleExtendedSchema], default: [] },
    combinations: { type: [CombinationSchema],  default: [] },
}, { timestamps: true });

export const GametypeMetadata = mongoose.model<GametypeMetadataDocument>(
    'GametypeMetadata',
    GametypeMetadataSchema
);
export default GametypeMetadata;
