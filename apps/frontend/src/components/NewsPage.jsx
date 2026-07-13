import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchContentByType } from '../services/api';
import Seo from './Seo';
import BlockContent from './content/BlockContent';
const PAGE_SIZE = 10;
export default function NewsPage() {
    const { t, i18n } = useTranslation();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async (off) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchContentByType('news', { limit: PAGE_SIZE, offset: off });
            setItems(prev => off === 0 ? data.items : [...prev, ...data.items]);
            setTotal(data.total);
        }
        catch {
            setError(t('content.error'));
        }
        finally {
            setLoading(false);
        }
    }, [t]);
    useEffect(() => { load(0); }, [load]);
    const loadMore = () => {
        const next = offset + PAGE_SIZE;
        setOffset(next);
        load(next);
    };
    const locale = i18n.language;
    return (<div data-testid="news-page" className="content-page" style={{ maxWidth: '800px' }}>
            <Seo title="Notícias" description="Últimas notícias e atualizações do CryptoBingo: novo game modes, torneios, parcerias e tudo sobre Bingo on-chain na WAX." canonical="/news"/>
            <h1 data-testid="news-title" className="content-page-title">
                {t('news.title')}
            </h1>

            {loading && items.length === 0 && (<div data-testid="news-loading" className="content-loading">
                    <div className="cb-shimmer" style={{ height: '8rem', marginBottom: '1rem' }}/>
                    <div className="cb-shimmer" style={{ height: '8rem', marginBottom: '1rem' }}/>
                    <div className="cb-shimmer" style={{ height: '8rem' }}/>
                </div>)}

            {error && (<div data-testid="news-error" className="content-error">
                    {error}
                </div>)}

            {!loading && !error && items.length === 0 && (<p data-testid="news-empty" className="content-empty">
                    {t('news.empty')}
                </p>)}

            <div data-testid="news-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {items.map((item) => {
            const override = item.locale_overrides?.[locale];
            const title = override?.title ?? item.title;
            const content = override?.content ?? item.content;
            return (<article key={item.id} data-testid={`news-item-${item.id}`} className="news-card">
                            {item.image_url && (<img src={item.image_url} alt={title} data-testid={`news-image-${item.id}`} className="news-card-image"/>)}

                            <div className="news-card-body">
                                <div className="news-card-meta">
                                    {item.pinned && (<span data-testid={`news-pinned-${item.id}`} className="news-pinned-badge">
                                            {t('news.pinned')}
                                        </span>)}
                                    <time dateTime={item.published_at} className="news-card-date">
                                        {new Date(item.published_at).toLocaleDateString()}
                                    </time>
                                </div>

                                <h2 data-testid={`news-heading-${item.id}`} className="news-card-heading">
                                    {title}
                                </h2>

                                <div data-testid={`news-content-${item.id}`}>
                                    {renderNewsContent(content, item.content_format)}
                                </div>
                            </div>
                        </article>);
        })}
            </div>

            {!loading && items.length < total && (<div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <button data-testid="news-load-more" onClick={loadMore} className="cb-btn cb-btn-primary cb-btn-sm">
                        {t('common.load_more')}
                    </button>
                </div>)}
        </div>);
}
function renderNewsContent(content, format) {
    if (format === 'blocks' && Array.isArray(content) && content.length > 0) {
        return <BlockContent blocks={content}/>;
    }
    const text = typeof content === 'string' ? content : '';
    return <p className="news-card-text">{text}</p>;
}
//# sourceMappingURL=NewsPage.js.map