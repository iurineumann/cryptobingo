import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Users, Trophy, Gift, Ticket } from 'lucide-react';
import Seo from './Seo';
import { getReferralStatus, generateReferralCode, applyReferralCode, } from '../services/api';
const TIER_LABELS = {
    bronze_referrer: 'Bronze',
    silver_referrer: 'Prata',
    gold_referrer: 'Ouro',
    platinum_referrer: 'Platina',
    diamond_referrer: 'Diamante',
};
export default function ReferralPage() {
    const { t } = useTranslation();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [applyCode, setApplyCode] = useState('');
    const [applyResult, setApplyResult] = useState(null);
    const [copied, setCopied] = useState(false);
    const [applying, setApplying] = useState(false);
    const loadStatus = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getReferralStatus();
            setStatus(data);
        }
        catch {
            setStatus(null);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { loadStatus(); }, [loadStatus]);
    const handleCopy = async () => {
        if (!status?.code)
            return;
        try {
            await navigator.clipboard.writeText(status.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch { }
    };
    const handleApply = async () => {
        if (!applyCode.trim())
            return;
        setApplying(true);
        setApplyResult(null);
        try {
            const result = await applyReferralCode(applyCode.trim().toUpperCase());
            setApplyResult({ ok: true, msg: result.message });
            setApplyCode('');
            loadStatus();
        }
        catch (err) {
            const msg = err?.message || 'Erro ao aplicar código.';
            setApplyResult({ ok: false, msg });
        }
        finally {
            setApplying(false);
        }
    };
    const handleGenerate = async () => {
        try {
            await generateReferralCode();
            loadStatus();
        }
        catch { }
    };
    if (loading) {
        return (<div className="cb-page">
                <Seo title={t('referral.title')}/>
                <div className="cb-page-loading">{t('common.loading')}</div>
            </div>);
    }
    const tierLabel = status?.tier ? TIER_LABELS[status.tier] || status.tier : null;
    return (<div className="cb-page">
            <Seo title={t('referral.title')}/>

            <div className="cb-page-header">
                <Users className="size-6"/>
                <h1>{t('referral.title')}</h1>
            </div>

            <p className="cb-page-desc">{t('referral.description')}</p>

            {!status?.code ? (<button className="cb-btn cb-btn-primary" onClick={handleGenerate} data-testid="referral-generate-btn">
                    {t('referral.generate_code')}
                </button>) : (<div className="cb-card" data-testid="referral-code-section">
                    <label>{t('referral.your_code')}</label>
                    <div className="flex items-center gap-2 mt-1">
                        <code className="cb-code-large" data-testid="referral-code">{status.code}</code>
                        <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={handleCopy} data-testid="referral-copy-btn" aria-label={t('referral.copy_code')}>
                            {copied ? <Check className="size-4 text-green-400"/> : <Copy className="size-4"/>}
                        </button>
                    </div>
                </div>)}

            <div className="cb-stats-grid">
                <div className="cb-stat-card" data-testid="referral-total-referred">
                    <Users className="size-5"/>
                    <span className="cb-stat-value">{status?.totalReferred ?? 0}</span>
                    <span className="cb-stat-label">{t('referral.total_referred')}</span>
                </div>
                <div className="cb-stat-card">
                    <Gift className="size-5"/>
                    <span className="cb-stat-value">{status?.xpEarned ?? 0}</span>
                    <span className="cb-stat-label">XP</span>
                </div>
                <div className="cb-stat-card">
                    <Ticket className="size-5"/>
                    <span className="cb-stat-value">{status?.ticketsEarned ?? 0}</span>
                    <span className="cb-stat-label">{t('referral.tickets_earned')}</span>
                </div>
                {tierLabel && (<div className="cb-stat-card">
                        <Trophy className="size-5"/>
                        <span className="cb-stat-value">{tierLabel}</span>
                        <span className="cb-stat-label">{t('referral.current_tier')}</span>
                    </div>)}
            </div>

            {status?.nextTier && (<div className="cb-card">
                    <p className="text-sm text-gray-400">
                        {t('referral.next_tier')}: {TIER_LABELS[status.nextTier.badge] || status.nextTier.badge}
                        {' '}— {t('referral.missing_referrals', { count: status.nextTier.remaining })}
                    </p>
                </div>)}

            <div className="cb-card">
                <h3>{t('referral.apply_title')}</h3>
                <div className="flex items-center gap-2 mt-2">
                    <input className="cb-input" value={applyCode} onChange={e => setApplyCode(e.target.value)} placeholder={t('referral.apply_placeholder')} data-testid="referral-apply-input"/>
                    <button className="cb-btn cb-btn-primary" onClick={handleApply} disabled={applying || !applyCode.trim()} data-testid="referral-apply-btn">
                        {applying ? t('common.loading') : t('referral.apply_btn')}
                    </button>
                </div>
                {applyResult && (<p className={`text-sm mt-2 ${applyResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {applyResult.msg}
                    </p>)}
            </div>
        </div>);
}
//# sourceMappingURL=ReferralPage.js.map