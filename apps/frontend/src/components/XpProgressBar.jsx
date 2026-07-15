import { useTranslation } from 'react-i18next';
const TIER_MAP = {
    Cobre: 'cobre',
    Bronze: 'bronze',
    Prata: 'prata',
    Ouro: 'ouro',
    Platina: 'platina',
    Esmeralda: 'esmeralda',
    Safira: 'safira',
    Rubi: 'rubi',
    Diamante: 'diamante',
};
export default function XpProgressBar({ tier, level, subLevel, progressPct, nextLevelXp, xpToNext, className = '', showLabel = true, size = 'sm', }) {
    const { t } = useTranslation();
    const tierKey = TIER_MAP[tier] ?? 'cobre';
    const tierClass = `cb-tier-${tierKey}`;
    const fillClass = `cb-progress-fill-${tierKey}`;
    const barHeight = size === 'md' ? '0.5rem' : '0.375rem';
    const clampedPct = Math.min(100, Math.max(0, progressPct));
    return (<div className={`cb-xp-bar ${className}`} data-testid="xp-progress-bar">
            {showLabel && (<div className="cb-xp-bar-label" data-testid="xp-bar-label">
                    <span className={tierClass}>{tier}</span>
                    <span className="cb-xp-bar-level">
                        {t('progression.level', { level })}
                    </span>
                </div>)}
            <div className="cb-progress-track" style={{ height: barHeight }} role="progressbar" aria-valuenow={Math.round(clampedPct)} aria-valuemin={0} aria-valuemax={100} aria-label={t('progression.xp_progress', {
            pct: Math.round(clampedPct),
        })} data-testid="xp-bar-track">
                <div className={`cb-progress-fill ${fillClass}`} style={{ width: `${clampedPct}%` }} data-testid="xp-bar-fill"/>
            </div>
            {showLabel && (<div className="cb-xp-bar-meta" data-testid="xp-bar-meta">
                    <span className="cb-xp-bar-sub">
                        {t('progression.sub_level', { subLevel })}
                    </span>
                    {xpToNext > 0 && (<span className="cb-xp-bar-next">
                            {t('progression.xp_to_next', { xp: xpToNext.toLocaleString() })}
                        </span>)}
                </div>)}
        </div>);
}
//# sourceMappingURL=XpProgressBar.js.map