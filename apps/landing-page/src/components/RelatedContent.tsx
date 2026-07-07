import { useTranslation } from 'react-i18next';

interface RelatedItem {
  title: string;
  slug: string;
  cover?: string;
}

interface RelatedContentProps {
  items: RelatedItem[];
  type: 'blog' | 'tutorial';
  locale: string;
}

export function RelatedContent({ items, type, locale }: RelatedContentProps) {
  const { t } = useTranslation();

  if (!items.length) return null;

  const basePath = type === 'blog' ? `/${locale}/blog` : `/${locale}/tutorials`;

  return (
    <section className="mt-12 pt-8 border-t border-gray-800">
      <h2 className="text-xl font-semibold text-white mb-6">
        {type === 'blog' ? t('content.relatedPosts') : t('content.relatedTutorials')}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map(item => (
          <a
            key={item.slug}
            href={`${basePath}/${item.slug}`}
            className="block p-4 bg-surface-800 rounded-lg border border-gray-800 hover:border-brand-500/30 transition-all"
          >
            <h3 className="text-sm font-medium text-white line-clamp-2">{item.title}</h3>
          </a>
        ))}
      </div>
    </section>
  );
}
