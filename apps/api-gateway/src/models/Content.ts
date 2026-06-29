// apps/api-gateway/src/models/Content.ts
// Conteúdo unificado editorial — collection 'content'. Ref: ADR-037.

import mongoose, { Schema, Document } from 'mongoose';
import type { ContentItem } from '@cryptobingo/shared-types';

export interface ContentDocument extends Omit<ContentItem, 'id' | 'published_at'>, Document {
    published_at: Date;
}

const LocaleOverrideSchema = new Schema(
    {
        title:   { type: Schema.Types.Mixed, required: true },
        content: { type: Schema.Types.Mixed, required: true },
    },
    { _id: false },
);

const ContentSchema = new Schema(
    {
        type:            { type: String, required: true, enum: ['faq', 'howitworks', 'sponsors', 'tutorials', 'news'], index: true },
        slug:            { type: String, required: true },
        title:           { type: String, required: true },
        content_format:  { type: String, required: true, enum: ['text', 'blocks'] },
        content:         { type: Schema.Types.Mixed, required: true },
        image_url:       { type: String, default: null },
        metadata:        { type: Schema.Types.Mixed, default: null },
        pinned:          { type: Boolean, default: false },
        sort_order:      { type: Number, default: 0 },
        locale_overrides: {
            'en-US': { type: LocaleOverrideSchema, default: undefined },
            'zh-CN': { type: LocaleOverrideSchema, default: undefined },
        },
        active:          { type: Boolean, default: true, index: true },
        published_at:    { type: Date, required: true },
        published_by:    { type: String, required: true },
    },
    { timestamps: true },
);

ContentSchema.index({ type: 1, active: 1, pinned: -1, sort_order: 1 });

export const Content = mongoose.model<ContentDocument>('Content', ContentSchema);
export default Content;
