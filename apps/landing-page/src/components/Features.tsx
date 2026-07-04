import { useTranslation } from 'react-i18next';
import { ShieldCheck, Award, UserCheck, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeatureItem {
  title: string;
  description: string;
  icon: string;
}

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  shield: ShieldCheck,
  trophy: Award,
  users: UserCheck,
  check: ShieldCheck,
};

interface FeaturesProps {
  features?: FeatureItem[];
}

function FeatureCard({ item, featured }: { item: FeatureItem; featured?: boolean }) {
  const Icon = iconMap[item.icon] || ShieldCheck;
  return (
    <div
      data-testid={`feature-card${featured ? '-featured' : ''}`}
      className={cn(
        'bg-surface-800 rounded-xl p-6 border transition-all',
        featured
          ? 'md:col-span-2 border-brand-500/30 ring-1 ring-brand-500/20 bg-brand-500/5 hover:shadow-card-hover'
          : 'border-surface-700/50 hover:border-surface-500 hover:-translate-y-0.5 hover:shadow-card-hover'
      )}
    >
      <Icon className="text-brand-400" size={featured ? 28 : 24} />
      <h3 className="text-lg font-semibold text-white mt-4 mb-2">
        {item.title}
      </h3>
      <p className="text-sm text-secondary leading-relaxed">
        {item.description}
      </p>
    </div>
  );
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
        <div className="grid grid-cols-1 gap-6">
          {items[0] && (
            <FeatureCard item={items[0]} featured />
          )}
          {items.length > 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {items.slice(1).map((f) => (
                <FeatureCard key={f.title} item={f} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
