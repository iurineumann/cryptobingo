import { useTranslation } from 'react-i18next';
import { useLoaderData, useParams } from 'react-router-dom';
import { loadTutorialPost, loadTutorials, computeRelatedPosts } from '../../lib/content';
import type { TutorialItem, RelatedPost } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';
import { ContentHeader } from '@/components/ContentHeader';
import { ContentBody } from '@/components/ContentBody';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { RelatedContent } from '@/components/RelatedContent';
import { FAQSection } from '@/components/FAQSection';

export async function loader({ params }: { params: { locale?: string; slug: string } }): Promise<{
  tutorial: TutorialItem;
  previous: TutorialItem | null;
  next: TutorialItem | null;
  total: number;
  current: number;
  relatedTutorials: RelatedPost[];
} | null> {
  const locale = params.locale || 'en';
  const tutorial = loadTutorialPost(params.slug, locale);
  if (!tutorial) return null;

  const all = loadTutorials(locale);
  const idx = all.findIndex(t => t.slug === params.slug);
  const previous = idx > 0 ? all[idx - 1] : null;
  const next = idx < all.length - 1 ? all[idx + 1] : null;
  const relatedTutorials = computeRelatedPosts(params.slug, locale, 'tutorial');

  return { tutorial, previous, next, total: all.length, current: idx + 1, relatedTutorials };
}

export default function TutorialPost() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof loader>();
  const { locale, slug } = useParams();
  const lang = locale || 'en';

  const words = (data?.tutorial?.body || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.ceil(words / 200));
  const readTimeLabel = t('content.readTime', { count: readTime });

  if (!data) {
    return (
      <>
        <Seo title={t('seo.tutorials_title')} description="" canonical={`/${lang}/tutorials/${slug}`} />
        <Header />
        <main id="main-content" className="max-w-3xl mx-auto px-4 py-20">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">{slug}</h1>
          <p className="text-slate-400">{t('tutorials.coming_soon')}</p>
        </main>
        <Footer />
      </>
    );
  }

  const { tutorial, previous, next, total, current, relatedTutorials } = data;

  return (
    <>
      <Seo title={tutorial.title} description={tutorial.description} canonical={`/${lang}/tutorials/${slug}`} />
      <Header />
      <main id="main-content" className="max-w-3xl mx-auto px-4 py-20">
        <Breadcrumbs
          segments={[
            { label: t('nav.home'), href: `/${lang}` },
            { label: t('nav.tutorials'), href: `/${lang}/tutorials` },
            { label: tutorial.title },
          ]}
        />
        <article>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">
                {t('tutorial.step', { current, total })}
              </span>
              <span className="text-sm text-gray-500">{Math.round((current / total) * 100)}%</span>
            </div>
            <div className="w-full h-1 bg-surface-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-300"
                style={{ width: `${(current / total) * 100}%` }}
              />
            </div>
          </div>

          <a
            href={`/${lang}/tutorials`}
            className="inline-flex items-center text-sm text-accent-400 hover:text-accent-300 mb-6 transition-colors"
          >
            ← {t('tutorials.back')}
          </a>
          <ContentHeader
            title={tutorial.title}
            description={tutorial.description}
            readTime={readTime}
            readTimeLabel={readTimeLabel}
          />
          <ContentBody html={tutorial.body} />
          {tutorial.faq && tutorial.faq.length > 0 && (
            <FAQSection
              items={tutorial.faq}
              locale={lang}
              storageKey={`faq-open-${tutorial.slug}`}
            />
          )}

          <nav className="mt-12 pt-8 border-t border-gray-800 flex items-center justify-between">
            <div>
              {previous && (
                <a
                  href={`/${lang}/tutorials/${previous.slug}`}
                  className="text-brand-400 hover:text-brand-300 transition-colors"
                >
                  {t('tutorial.previous')}: {previous.title}
                </a>
              )}
            </div>
            <div>
              {next && (
                <a
                  href={`/${lang}/tutorials/${next.slug}`}
                  className="text-brand-400 hover:text-brand-300 transition-colors"
                >
                  {t('tutorial.next')}: {next.title}
                </a>
              )}
            </div>
          </nav>
        </article>

        <RelatedContent items={relatedTutorials} type="tutorial" locale={lang} />
      </main>
      <Footer />
    </>
  );
}
