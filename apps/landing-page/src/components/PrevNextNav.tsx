import { useTranslation } from 'react-i18next';

interface NavItem {
  title: string;
  slug: string;
}

interface PrevNextNavProps {
  locale: string;
  basePath: string;
  previous?: NavItem | null;
  next?: NavItem | null;
}

export function PrevNextNav({ locale, basePath, previous, next }: PrevNextNavProps) {
  const { t } = useTranslation();

  if (!previous && !next) return null;

  return (
    <nav className="mt-8 pt-6 border-t border-gray-800 flex items-center justify-between gap-4">
      <div className="flex-1">
        {previous && (
          <a
            href={`${basePath}/${previous.slug}`}
            className="group block text-left"
          >
            <span className="text-xs text-gray-500">{t('content.previous')}</span>
            <span className="block text-sm text-brand-400 group-hover:text-brand-300 transition-colors line-clamp-1">
              {previous.title}
            </span>
          </a>
        )}
      </div>
      <div className="flex-1 text-right">
        {next && (
          <a
            href={`${basePath}/${next.slug}`}
            className="group block text-right"
          >
            <span className="text-xs text-gray-500">{t('content.next')}</span>
            <span className="block text-sm text-brand-400 group-hover:text-brand-300 transition-colors line-clamp-1">
              {next.title}
            </span>
          </a>
        )}
      </div>
    </nav>
  );
}
