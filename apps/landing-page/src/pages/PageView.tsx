import { useTranslation } from 'react-i18next';
import { Link, useParams, useLoaderData } from 'react-router-dom';
import { loadPageContent } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';
import { TocSidebar } from '@/components/TocSidebar';
import { Breadcrumbs } from '@/components/Breadcrumbs';

export async function loader({ params }: { params: { locale?: string; slug: string } }) {
  const locale = params.locale || 'en';
  return loadPageContent(params.slug, locale);
}

export default function PageView() {
  const { t } = useTranslation();
  const { locale, slug } = useParams();
  const lang = locale || 'en';
  const page = useLoaderData<typeof loader>();

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
          <Breadcrumbs
            segments={[
              { label: t('nav.home'), href: `/${lang}` },
              { label: page.title },
            ]}
          />

          <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-12">
            {page.headings?.length > 0 && (
              <TocSidebar headings={page.headings} />
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
