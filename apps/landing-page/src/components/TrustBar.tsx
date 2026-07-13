import { useTranslation } from 'react-i18next';
import { ShieldCheck, Verified, ExternalLink, Users } from 'lucide-react';

const trustItems = [
  { icon: ShieldCheck, labelKey: 'trust_bar.built_on_wax' },
  { icon: Verified, labelKey: 'trust_bar.audited' },
  { icon: ShieldCheck, labelKey: 'trust_bar.provably_fair' },
  { icon: Users, labelKey: 'trust_bar.players_count' },
];

export default function TrustBar() {
  const { t } = useTranslation();

  return (
    <section className="border-y border-brand-500/10 bg-brand-500/[0.03]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {trustItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.labelKey}
                data-testid={`trust-${item.labelKey}`}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
              >
                <Icon className="text-brand-400 shrink-0" size={16} />
                <span>{t(item.labelKey)}</span>
              </div>
            );
          })}
          <a
            href="https://waxblock.io/account/bingogamectr"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="trust-contract-link"
            className="flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300 transition-colors"
          >
            <ExternalLink size={16} />
            {t('trust_bar.view_contract')}
          </a>
        </div>
      </div>
    </section>
  );
}
