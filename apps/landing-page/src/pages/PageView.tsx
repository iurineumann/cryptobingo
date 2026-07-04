import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useLoaderData } from 'react-router-dom';
import { loadPageContent } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

export async function loader({ params }: { params: { locale?: string; slug: string } }) {
  const locale = params.locale || 'en';
  return loadPageContent(params.slug, locale);
}

export default function PageView() {
  const { t } = useTranslation();
  const { locale, slug } = useParams();
  const lang = locale || 'en';
  const page = useLoaderData<typeof loader>();
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    if (!page?.headings?.length) return;
    const ids = page.headings.map(h => h.id);
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter(e => e.isIntersecting);
        if (intersecting.length > 0) {
          const topmost = intersecting.reduce((best, e) =>
            e.boundingClientRect.top < best.boundingClientRect.top ? e : best
          );
          setActiveId(topmost.target.id);
        }
      },
      { rootMargin: '-80px 0px -40% 0px' }
    );
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [page?.headings]);

  if (!page) {
    return (
      <>
        <Seo title={t('seo.page_not_found')} description="" canonical={`/${lang}/${slug}`} />
        <Header />
        <main id="main-content" className="max-w-3xl mx-auto px-4 py-20">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">{t('page_not_found')}</h1>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Seo title={page.title} description={page.description} canonical={`/${lang}/${slug}`} />
      <Header />
      <main id="main-content" className="legal-doc-page">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <nav className="mb-8 text-sm text-gray-400" aria-label="Breadcrumb">
            <Link to={`/${lang}`} className="hover:text-brand-400 transition-colors">
              Home
            </Link>
            <span className="mx-2">/</span>
            <span className="text-gray-300">{page.title}</span>
          </nav>

          <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-12">
            {page.headings?.length > 0 && (
              <>
                <aside className="hidden lg:block">
                  <div className="sticky top-24">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
                      On this page
                    </h2>
                    <nav className="space-y-1">
                      {page.headings.map(h => (
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

                <details className="lg:hidden mb-8 bg-white/5 rounded-lg border border-gray-700/50 open:border-brand-500/30 transition-colors">
                  <summary className="px-4 py-3 text-sm font-medium text-gray-300 cursor-pointer flex items-center justify-between">
                    <span>On this page</span>
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div className="px-4 pb-3 space-y-1 border-t border-gray-700/50 pt-2">
                    {page.headings.map(h => (
                      <a
                        key={h.id}
                        href={`#${h.id}`}
                        className="block text-sm py-1.5 text-gray-400 hover:text-gray-200 transition-colors"
                      >
                        {h.text}
                      </a>
                    ))}
                  </div>
                </details>
              </>
            )}

            <article>
              <header className="mb-10">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                  {page.title}
                </h1>
                <p className="text-sm text-gray-500">
                  Last updated: <time dateTime={page.lastUpdated}>{page.lastUpdated}</time>
                </p>
              </header>

              <div
                className="legal-doc-body prose prose-invert prose-lg max-w-none"
                dangerouslySetInnerHTML={{ __html: page.body }}
              />

              <hr className="my-12 border-gray-800" />
              <Link
                to={`/${lang}`}
                className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-brand-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Home
              </Link>
            </article>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
