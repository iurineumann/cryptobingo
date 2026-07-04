import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Coins, Flame, Gavel, ArrowRightLeft } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

const distribution = [
  { label: 'Ecosystem & Development', pct: 30, color: 'bg-purple-500' },
  { label: 'Liquidity Pool', pct: 20, color: 'bg-cyan-500' },
  { label: 'Community Rewards', pct: 20, color: 'bg-amber-500' },
  { label: 'Team (vested 24 months)', pct: 15, color: 'bg-emerald-500' },
  { label: 'Marketing & Partnerships', pct: 10, color: 'bg-rose-500' },
  { label: 'Advisors', pct: 5, color: 'bg-indigo-400' },
];

const utilities = [
  { icon: Coins, titleKey: 'tokenomics.staking_title', descKey: 'tokenomics.staking_desc' },
  { icon: Flame, titleKey: 'tokenomics.buyback_title', descKey: 'tokenomics.buyback_desc' },
  { icon: Gavel, titleKey: 'tokenomics.governance_title', descKey: 'tokenomics.governance_desc' },
  { icon: ArrowRightLeft, titleKey: 'tokenomics.liquidity_title', descKey: 'tokenomics.liquidity_desc' },
];

export default function TokenomicsPage() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const lang = locale || 'en';

  return (
    <>
      <Seo title={t('tokenomics.title')} description={t('tokenomics.description')} canonical={`/${lang}/tokenomics`} />
      <Header />
      <main id="main-content" className="max-w-5xl mx-auto px-4 py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
          {t('tokenomics.title')}
        </h1>
        <p className="text-slate-400 mb-16">
          {t('tokenomics.description')}
        </p>

        <section className="mb-20" data-testid="rtp-ggr-section">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-700/30 rounded-2xl p-8 text-center">
              <p className="text-purple-300 text-sm font-medium uppercase tracking-wider mb-2">
                {t('tokenomics.rtp_label')}
              </p>
              <p className="text-5xl sm:text-6xl font-bold text-white" data-testid="rtp-value">
                {t('tokenomics.rtp_value')}
              </p>
            </div>
            <div className="bg-gradient-to-br from-cyan-900/40 to-cyan-800/20 border border-cyan-700/30 rounded-2xl p-8 text-center">
              <p className="text-cyan-300 text-sm font-medium uppercase tracking-wider mb-2">
                {t('tokenomics.ggr_label')}
              </p>
              <p className="text-5xl sm:text-6xl font-bold text-white" data-testid="ggr-value">
                {t('tokenomics.ggr_value')}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-20" data-testid="supply-section">
          <h2 className="text-2xl font-semibold text-white mb-8">
            {t('tokenomics.supply_title')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {distribution.map((item) => (
              <div
                key={item.label}
                className="bg-surface-800 rounded-xl border border-surface-700/50 p-5"
                data-testid={`dist-${item.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-medium text-sm">{item.label}</span>
                  <span className="text-2xl font-bold text-white">{item.pct}%</span>
                </div>
                <div className="w-full bg-surface-700 rounded-full h-2">
                  <div className={`${item.color} h-2 rounded-full`} style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-20" data-testid="utility-section">
          <h2 className="text-2xl font-semibold text-white mb-8">
            {t('tokenomics.utility_title')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {utilities.map(({ icon: Icon, titleKey, descKey }) => (
              <div
                key={titleKey}
                className="bg-surface-800 rounded-xl border border-surface-700/50 p-6 flex gap-5"
              >
                <div className="shrink-0 w-12 h-12 bg-purple-900/40 rounded-xl flex items-center justify-center">
                  <Icon className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-1">{t(titleKey)}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{t(descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="text-center">
          <a
            data-testid="swap-link"
            href={t('tokenomics.swap_url')}
            className="inline-flex items-center gap-2 px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold text-lg transition-colors"
          >
            {t('tokenomics.swap_cta')}
          </a>
        </section>
      </main>
      <Footer />
    </>
  );
}
