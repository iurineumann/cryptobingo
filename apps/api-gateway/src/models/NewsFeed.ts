// apps/api-gateway/src/models/NewsFeed.ts
// Publicações de notícias/promoções admin — MongoDB. Ref: ADR-024.

import mongoose, { Schema, Document } from 'mongoose';
import type { NewsItem } from '@cryptobingo/shared-types';

export interface NewsFeedDocument extends Omit<NewsItem, 'id' | 'published_at'>, Document {
    published_at: Date;  // armazenado como Date no MongoDB; convertido para ISO string em docToNewsItem()
}

const LocaleOverrideSchema = new Schema(
    {
        title:   { type: String, required: true },
        content: { type: String, required: true },
    },
    { _id: false },
);

const NewsFeedSchema = new Schema(
    {
        title:            { type: String, required: true },
        content:          { type: String, required: true },
        image_url:        { type: String, default: null },
        locale_overrides: {
            'en-US': { type: LocaleOverrideSchema, default: undefined },
            'zh-CN': { type: LocaleOverrideSchema, default: undefined },
        },
        active:           { type: Boolean, default: true,  index: true },
        pinned:           { type: Boolean, default: false, index: true },
        published_at:     { type: Date,    required: true, index: true },
        published_by:     { type: String,  required: true },
    },
    { timestamps: true },
);

NewsFeedSchema.index({ active: 1, pinned: -1, published_at: -1 });

export const NewsFeed = mongoose.model<NewsFeedDocument>('NewsFeed', NewsFeedSchema);
export default NewsFeed;
