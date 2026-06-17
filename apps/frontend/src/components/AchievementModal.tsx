import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAchievements } from '../services/api';
import type { AchievementDef } from '../services/api';

interface AchievementModalProps {
    onClose: () => void;
}

export default function AchievementModal({ onClose }: AchievementModalProps) {
    const { t } = useTranslation();
    const [items, setItems] = useState<AchievementDef[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetchAchievements()
            .then(res => { if (!cancelled) setItems(res.achievements); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const unlocked = items.filter(a => a.unlocked).length;

    return (
        <div
            className="cb-overlay"
            onClick={e => e.target === e.currentTarget && onClose()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="achievement-modal-title"
        >
            <div className="cb-modal" data-testid="achievement-modal" style={{ maxWidth: '32rem' }}>
                <div className="cb-modal-header">
                    <h2 id="achievement-modal-title" className="cb-modal-title flex items-center gap-2">
                        <span aria-hidden="true">🏅</span>
                        {t('achievements.title')}
                    </h2>
                    <button
                        className="cb-modal-close"
                        data-testid="achievement-modal-close"
                        onClick={onClose}
                        aria-label={t('common.close')}
                    >
                        ✕
                    </button>
                </div>

                <div className="cb-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    {!loading && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--cb-text-secondary)', marginBottom: '1rem', textAlign: 'center' }}>
                            {t('achievements.progress', { unlocked, total: items.length })}
                        </div>
                    )}

                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                            <span className="cb-spinner" style={{ width: '1.5rem', height: '1.5rem', borderWidth: '2px' }} />
                        </div>
                    ) : (
                        <div className="cb-achievement-grid">
                            {items.map(a => (
                                <div
                                    key={a.id}
                                    className={`cb-achievement-card${!a.unlocked ? ' cb-achievement-locked' : ''}`}
                                    data-testid={`achievement-${a.id}`}
                                >
                                    <span className="cb-achievement-icon" aria-hidden="true">
                                        {a.unlocked ? a.icon : '🔒'}
                                    </span>
                                    <div className="cb-achievement-info">
                                        <span className="cb-achievement-label">{a.label}</span>
                                        <span className="cb-achievement-desc">{a.desc}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
