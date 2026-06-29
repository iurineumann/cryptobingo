import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchContentByType } from '../../services/api';
import type { ContentItem } from '@cryptobingo/shared-types';
import BlockContent from './BlockContent';

type ContentType = 'faq' | 'howitworks' | 'sponsors' | 'tutorials' | 'news';

interface ContentPageProps {
    type: ContentType;
    testId?: string;
    titleKey?: string;
    subtitleKey?: string;
}

export default function ContentPage({ type, testId, titleKey, subtitleKey }: Readonly<ContentPageProps>) {
    const { t, i18n } = useTranslation();
    const [items, setItems] = useState<ContentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchContentByType(type);
            setItems(data.items ?? []);
        } catch {
            setError(t('content.error'));
        } finally {
            setLoading(false);
        }
    }, [type, t]);

    useEffect(() => { load(); }, [load]);

    const testPrefix = testId ?? type;
    const locale = i18n.language as 'en-US' | 'zh-CN' | string;

    return (
        <div
            data-testid={`${testPrefix}-page`}
            className="content-page"
        >
            {titleKey && (
                <h1
                    data-testid={`${testPrefix}-title`}
                    className="content-page-title"
                >
                    {t(titleKey)}
                </h1>
            )}
            {subtitleKey && (
                <p className="content-page-subtitle">
                    {t(subtitleKey)}
                </p>
            )}

            {loading && (
                <div data-testid={`${testPrefix}-loading`} className="content-loading">
                    <div className="cb-shimmer" style={{ height: '1rem', width: '60%', marginBottom: '0.75rem' }} />
                    <div className="cb-shimmer" style={{ height: '1rem', width: '80%', marginBottom: '0.75rem' }} />
                    <div className="cb-shimmer" style={{ height: '1rem', width: '45%' }} />
                </div>
            )}

            {error && (
                <div data-testid={`${testPrefix}-error`} className="content-error">
                    {error}
                </div>
            )}

            {!loading && !error && items.length === 0 && (
                <p data-testid={`${testPrefix}-empty`} className="content-empty">
                    {t('content.empty')}
                </p>
            )}

            <div data-testid={`${testPrefix}-list`} className="content-list">
                {items.map((item, idx) => {
                    const override = item.locale_overrides?.[locale as 'en-US' | 'zh-CN'];
                    const title   = override?.title   ?? item.title;
                    const content = override?.content ?? item.content;

                    return (
                        <section
                            key={item.id}
                            data-testid={`${testPrefix}-section-${idx}`}
                            className="content-section"
                        >
                            <h2
                                data-testid={`${testPrefix}-heading-${idx}`}
                                className="content-section-title"
                            >
                                {title}
                            </h2>
                            {item.published_at && (
                                <time
                                    dateTime={item.published_at}
                                    className="content-section-date"
                                >
                                    {t('content.published_at')}: {new Date(item.published_at).toLocaleDateString()}
                                </time>
                            )}
                            <div className="content-section-body">
                                {renderContent(content, item.content_format)}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

function renderContent(content: string | unknown[], format: 'text' | 'blocks') {
    if (format === 'blocks' && Array.isArray(content) && content.length > 0) {
        return <BlockContent blocks={content} />;
    }
    const text = typeof content === 'string' ? content : '';
    return <p className="content-text">{text}</p>;
}
