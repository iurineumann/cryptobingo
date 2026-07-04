import { useTranslation } from 'react-i18next';
import { ShieldCheck, Cpu, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeatureItem {
  title: string;
  description: string;
  icon: string;
}

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  shield: ShieldCheck,
  trophy: Cpu,
  users: Cpu,
  check: ShieldCheck,
};

interface FeaturesProps {
  features?: FeatureItem[];
}

export default function Features({ features }: FeaturesProps) {
  const { t } = useTranslation();

  const defaultFeatures: FeatureItem[] = [
    {
      icon: 'shield',
      title: t('features.items.0.title'),
      description: t('features.items.0.description'),
    },
    {
      icon: 'trophy',
      title: t('features.items.1.title'),
      description: t('features.items.1.description'),
    },
    {
      icon: 'users',
      title: t('features.items.2.title'),
      description: t('features.items.2.description'),
    },
  ];

  const items = features?.length ? features : defaultFeatures;

  return (
    <section id="features" className="py-20 bg-surface-900">
      <div className="max-w-7xl mx-auto px-4">
        <p className="text-sm text-brand-400 font-semibold mb-2">
          {t('features.section_tag')}
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-12">
          {t('features.section_title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((f) => {
            const Icon = iconMap[f.icon] || ShieldCheck;
            return (
              <div
                key={f.title}
                className={cn(
                  'bg-surface-800 rounded-xl p-6 border border-surface-700/50',
                  'hover:border-surface-500 transition-all hover:-translate-y-0.5 hover:shadow-card-hover'
                )}
              >
                <Icon className="text-brand-400" size={24} />
                <h3 className="text-lg font-semibold text-white mt-4 mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-secondary leading-relaxed">
                  {f.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
