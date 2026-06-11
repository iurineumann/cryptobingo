// apps/frontend/src/components/NewsPage.tsx
// Feed de notícias/promoções público — MongoDB via api-gateway. Ref: ADR-024.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchNews } from '../services/api';
import type { NewsItem } from '@cryptobingo/shared-types';

const PAGE_SIZE = 10;

export default function NewsPage() {
    const { t, i18n } = useTranslation();
    const [items, setItems]       = useState<NewsItem[]>([]);
    const [total, setTotal]       = useState(0);
    const [offset, setOffset]     = useState(0);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);

    const load = useCallback(async (off: number) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchNews({ limit: PAGE_SIZE, offset: off });
            setItems(prev => off === 0 ? data.items : [...prev, ...data.items]);
            setTotal(data.total);
        } catch (err: any) {
            setError(err.message ?? t('common.error'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { load(0); }, [load]);

    const loadMore = () => {
        const next = offset + PAGE_SIZE;
        setOffset(next);
        load(next);
    };

    const locale = i18n.language as 'en-US' | 'zh-CN' | string;

    return (
        <div
            data-testid="news-page"
            style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}
        >
            <h1
                data-testid="news-title"
                style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '2rem', color: 'var(--cb-text-primary)' }}
            >
                {t('news.title')}
            </h1>

            {loading && items.length === 0 && (
                <div data-testid="news-loading" style={{ textAlign: 'center', padding: '3rem' }}>
                    <span className="cb-spinner" style={{ width: '2rem', height: '2rem', borderWidth: '3px' }} />
                </div>
            )}

            {error && (
                <div data-testid="news-error" style={{ color: 'var(--cb-danger)', padding: '1rem' }}>
                    {error}
                </div>
            )}

            {!loading && !error && items.length === 0 && (
                <p data-testid="news-empty" style={{ color: 'var(--cb-text-secondary)', textAlign: 'center', padding: '3rem' }}>
                    {t('news.empty')}
                </p>
            )}

            <div data-testid="news-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {items.map((item) => {
                    const override = item.locale_overrides?.[locale as 'en-US' | 'zh-CN'];
                    const title   = override?.title   ?? item.title;
                    const content = override?.content ?? item.content;

                    return (
                        <article
                            key={item.id}
                            data-testid={`news-item-${item.id}`}
                            style={{
                                border: '1px solid var(--cb-border)',
                                borderRadius: '0.75rem',
                                overflow: 'hidden',
                                background: 'var(--cb-bg-card)',
                            }}
                        >
                            {item.image_url && (
                                <img
                                    src={item.image_url}
                                    alt={title}
                                    data-testid={`news-image-${item.id}`}
                                    style={{ width: '100%', maxHeight: '240px', objectFit: 'cover', display: 'block' }}
                                />
                            )}

                            <div style={{ padding: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    {item.pinned && (
                                        <span
                                            data-testid={`news-pinned-${item.id}`}
                                            style={{
                                                fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                                                background: 'var(--cb-primary)', color: '#fff', borderRadius: '999px',
                                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                            }}
                                        >
                                            {t('news.pinned')}
                                        </span>
                                    )}
                                    <time
                                        dateTime={item.published_at}
                                        style={{ fontSize: '0.75rem', color: 'var(--cb-text-secondary)' }}
                                    >
                                        {new Date(item.published_at).toLocaleDateString()}
                                    </time>
                                </div>

                                <h2
                                    data-testid={`news-heading-${item.id}`}
                                    style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--cb-text-primary)' }}
                                >
                                    {title}
                                </h2>

                                <p
                                    data-testid={`news-content-${item.id}`}
                                    style={{ color: 'var(--cb-text-secondary)', lineHeight: '1.6', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}
                                >
                                    {content}
                                </p>
                            </div>
                        </article>
                    );
                })}
            </div>

            {!loading && items.length < total && (
                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <button
                        data-testid="news-load-more"
                        onClick={loadMore}
                        style={{
                            padding: '0.6rem 1.5rem',
                            background: 'var(--cb-primary)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        {t('common.load_more')}
                    </button>
                </div>
            )}
        </div>
    );
}
