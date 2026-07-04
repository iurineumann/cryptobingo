import { useTranslation } from 'react-i18next';
import { Puzzle, ArrowRight, ShieldCheck } from 'lucide-react';

const steps = [
  {
    icon: Puzzle,
    labelKey: 'how_it_works.step1_label',
    titleKey: 'how_it_works.step1_title',
    descKey: 'how_it_works.step1_desc',
  },
  {
    icon: ArrowRight,
    labelKey: 'how_it_works.step2_label',
    titleKey: 'how_it_works.step2_title',
    descKey: 'how_it_works.step2_desc',
  },
  {
    icon: ShieldCheck,
    labelKey: 'how_it_works.step3_label',
    titleKey: 'how_it_works.step3_title',
    descKey: 'how_it_works.step3_desc',
  },
];

export default function HowItWorks() {
  const { t } = useTranslation();

  return (
    <section id="how-it-works" className="py-20 bg-surface-950">
      <div className="max-w-5xl mx-auto px-4">
        <p className="text-sm text-brand-400 font-semibold mb-2 text-center">
          {t('how_it_works.section_tag')}
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-center">
          {t('how_it_works.section_title')}
        </h2>
        <p className="text-secondary text-center max-w-2xl mx-auto mb-16">
          {t('how_it_works.section_desc')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.labelKey}
                data-testid={`how-it-works-step-${i}`}
                className="relative flex flex-col items-center text-center"
              >
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-brand-500/10 text-brand-400 mb-5">
                  <Icon size={24} />
                </div>
                <span className="text-xs font-semibold text-brand-400 tracking-widest uppercase mb-2">
                  {t(step.labelKey)}
                </span>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {t(step.titleKey)}
                </h3>
                <p className="text-sm text-secondary leading-relaxed max-w-xs">
                  {t(step.descKey)}
                </p>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-7 -right-4 text-slate-600" aria-hidden="true">
                    <ArrowRight size={20} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
