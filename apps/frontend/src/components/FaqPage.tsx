import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchContentByType } from '../services/api';
import type { ContentItem } from '@cryptobingo/shared-types';

export default function FaqPage() {
    const { t, i18n } = useTranslation();
    const [items, setItems] = useState<ContentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchContentByType('faq');
            setItems(data.items ?? []);
        } catch {
            setError(t('content.error'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { load(); }, [load]);

    const locale = i18n.language as 'en-US' | 'zh-CN' | string;

    return (
        <div
            data-testid="faq-page"
            className="content-page"
        >
            <h1
                data-testid="faq-title"
                className="content-page-title"
            >
                {t('faq.title')}
            </h1>
            <p className="content-page-subtitle">
                {t('faq.subtitle')}
            </p>

            {loading && (
                <div data-testid="faq-loading" className="content-loading">
                    <div className="cb-shimmer" style={{ height: '3rem', marginBottom: '0.5rem' }} />
                    <div className="cb-shimmer" style={{ height: '3rem', marginBottom: '0.5rem' }} />
                    <div className="cb-shimmer" style={{ height: '3rem', marginBottom: '0.5rem' }} />
                </div>
            )}

            {error && (
                <div data-testid="faq-error" className="content-error">
                    {error}
                </div>
            )}

            {!loading && !error && items.length === 0 && (
                <p data-testid="faq-empty" className="content-empty">
                    {t('content.empty')}
                </p>
            )}

            <div data-testid="faq-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {items.map((item, idx) => {
                    const override = item.locale_overrides?.[locale as 'en-US' | 'zh-CN'];
                    const question = (override?.content ?? item.metadata?.question ?? item.title) as string;
                    const answer   = (override?.content ?? item.content) as string;

                    return (
                        <div
                            key={item.id}
                            data-testid={`faq-item-${idx}`}
                            className="faq-item"
                        >
                            <button
                                data-testid={`faq-question-${idx}`}
                                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                                aria-expanded={openIndex === idx}
                                className="faq-question"
                            >
                                <span>{question}</span>
                                <span className="faq-toggle" aria-hidden="true">
                                    {openIndex === idx ? '−' : '+'}
                                </span>
                            </button>
                            {openIndex === idx && (
                                <div
                                    data-testid={`faq-answer-${idx}`}
                                    className="faq-answer"
                                >
                                    {answer}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
