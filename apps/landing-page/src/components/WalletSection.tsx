import { useTranslation } from 'react-i18next';
import { Shield, Zap, Wallet, ArrowRight } from 'lucide-react';

const valueProps = [
  { icon: Shield, key: 'secure' },
  { icon: Zap, key: 'instant' },
  { icon: Wallet, key: 'withdraw' },
];

const steps = [
  { icon: Wallet, key: 'step1' },
  { icon: ArrowRight, key: 'step2' },
  { icon: Zap, key: 'step3' },
];

export default function WalletSection() {
  const { t } = useTranslation();

  return (
    <section className="py-20 bg-surface-900" id="wallet">
      <div className="max-w-5xl mx-auto px-4">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-center">
          {t('wallet.title')}
        </h2>
        <p className="text-secondary text-center max-w-2xl mx-auto mb-12">
          {t('wallet.desc')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {valueProps.map((vp) => {
            const Icon = vp.icon;
            return (
              <div key={vp.key} className="bg-surface-800/50 rounded-xl p-6 border border-surface-700/30">
                <div className="w-12 h-12 rounded-lg bg-brand-500/10 flex items-center justify-center mb-4">
                  <Icon size={22} className="text-brand-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1">{t(`wallet.value_${vp.key}_title`)}</h3>
                <p className="text-sm text-secondary">{t(`wallet.value_${vp.key}_desc`)}</p>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-center gap-6">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent-500/10 flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-accent-400" />
                  </div>
                  <span className="text-sm text-slate-300">{t(`wallet.${step.key}`)}</span>
                </div>
                {i < steps.length - 1 && (
                  <ArrowRight size={16} className="hidden md:block text-slate-600 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
