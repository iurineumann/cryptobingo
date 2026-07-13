import { useTranslation } from 'react-i18next';

interface TagFilterProps {
  tags: string[];
  activeTag: string | null;
  basePath: string;
}

export function TagFilter({ tags, activeTag, basePath }: TagFilterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2 mb-8" data-testid="tag-filter">
      <a
        href={basePath}
        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
          !activeTag
            ? 'bg-brand-500/20 text-brand-300'
            : 'bg-surface-800 text-gray-400 hover:text-brand-400'
        }`}
      >
        {t('tagFilter.all')}
      </a>
      {tags.map(tag => (
        <a
          key={tag}
          href={`${basePath}?tag=${tag}`}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            activeTag === tag
              ? 'bg-brand-500/20 text-brand-300'
              : 'bg-surface-800 text-gray-400 hover:text-brand-400'
          }`}
        >
          {tag}
        </a>
      ))}
    </div>
  );
}
