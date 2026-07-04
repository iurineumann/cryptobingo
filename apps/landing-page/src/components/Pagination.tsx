interface PaginationProps {
  current: number;
  total: number;
  basePath: string;
}

export function Pagination({ current, total, basePath }: PaginationProps) {
  if (total <= 1) return null;

  const pages = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 mt-12">
      {current > 1 && (
        <a
          href={`${basePath}?page=${current - 1}`}
          aria-label="Previous"
          className="px-3 py-2 text-sm text-gray-400 hover:text-brand-400 transition-colors"
        >
          ←
        </a>
      )}
      {pages.map(p => (
        <a
          key={p}
          href={`${basePath}?page=${p}`}
          className={`px-3 py-2 text-sm rounded transition-colors ${
            p === current
              ? 'bg-brand-500/20 text-brand-300 font-medium'
              : 'text-gray-400 hover:text-brand-400'
          }`}
        >
          {p}
        </a>
      ))}
      {current < total && (
        <a
          href={`${basePath}?page=${current + 1}`}
          aria-label="Next"
          className="px-3 py-2 text-sm text-gray-400 hover:text-brand-400 transition-colors"
        >
          →
        </a>
      )}
    </nav>
  );
}
