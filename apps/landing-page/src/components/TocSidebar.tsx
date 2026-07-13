import { useActiveHeading } from '../hooks/useActiveHeading';
import { useState } from 'react';

interface TocHeading {
  id: string;
  text: string;
}

interface TocSidebarProps {
  headings: TocHeading[];
}

export function TocSidebar({ headings }: TocSidebarProps) {
  const activeId = useActiveHeading(headings.map(h => h.id));
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!headings.length) return null;

  return (
    <>
      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
            On this page
          </h2>
          <nav className="space-y-1">
            {headings.map(h => (
              <a
                key={h.id}
                href={`#${h.id}`}
                className={`block text-sm py-1.5 border-l-2 pl-4 transition-all ${
                  activeId === h.id
                    ? 'border-brand-500 text-brand-300 font-medium'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {h.text}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <div data-testid="toc-mobile" className="lg:hidden mb-8">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white/5 rounded-lg border border-gray-700/50 text-sm text-gray-300"
          aria-expanded={mobileOpen}
        >
          <span>On this page</span>
          <svg className={`w-4 h-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {mobileOpen && (
          <nav className="mt-2 px-2 py-2 bg-white/5 rounded-lg border border-gray-700/50">
            {headings.map(h => (
              <a
                key={h.id}
                href={`#${h.id}`}
                onClick={() => setMobileOpen(false)}
                className={`block text-sm py-2 px-3 rounded transition-colors ${
                  activeId === h.id
                    ? 'text-brand-300 bg-brand-500/10 font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                {h.text}
              </a>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}
