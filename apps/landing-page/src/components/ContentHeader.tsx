import { ContentHeaderProps } from '../types/content';

export function ContentHeader({
  title, description, cover, author, date, tags, readTime, readTimeLabel,
}: ContentHeaderProps) {
  return (
    <header className="mb-8">
      <div className="relative w-full aspect-video rounded-xl overflow-hidden mb-6 bg-surface-800">
        <img
          src={cover || '/og-image.png'}
          alt={title}
          className="w-full h-full object-cover"
          loading="eager"
        />
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
        {title}
      </h1>
      {description && (
        <p className="text-lg text-gray-400 mb-4">{description}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-4">
        {author && <span>{author}</span>}
        {date && (
          <>
            <span aria-hidden="true">·</span>
            <time dateTime={date}>
              {new Date(date).toLocaleDateString()}
            </time>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{readTimeLabel ?? `${readTime} min de leitura`}</span>
      </div>
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <a
              key={tag}
              href={`?tag=${tag}`}
              className="px-3 py-1 text-xs font-medium rounded-full bg-surface-700 text-brand-300 hover:bg-surface-600 transition-colors"
            >
              {tag}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
