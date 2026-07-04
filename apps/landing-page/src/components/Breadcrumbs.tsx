interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  segments: BreadcrumbSegment[];
}

export function Breadcrumbs({ segments }: BreadcrumbsProps) {
  const items = segments.map((s, i) => ({
    '@type': 'ListItem' as const,
    position: i + 1,
    name: s.label,
    ...(s.href ? { item: s.href } : {}),
  }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        {segments.map((s, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span data-testid="breadcrumb-sep" aria-hidden="true" className="text-gray-600">
                /
              </span>
            )}
            {s.href ? (
              <a href={s.href} className="hover:text-brand-400 transition-colors">
                {s.label}
              </a>
            ) : (
              <span className="text-gray-300">{s.label}</span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
