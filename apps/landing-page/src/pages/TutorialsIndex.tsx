import { useTranslation } from 'react-i18next';
import { Link, useLoaderData, useParams } from 'react-router-dom';
import { loadTutorials } from '../../lib/content';
import type { TutorialItem } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

export async function loader({ params }: { params: { locale?: string } }): Promise<{ items: TutorialItem[] }> {
  const locale = params.locale || 'en';
  return { items: loadTutorials(locale) };
}

export default function TutorialsIndex() {
  const { t } = useTranslation();
  const { items } = useLoaderData<typeof loader>();
  const { locale } = useParams();
  const lang = locale || 'en';

  return (
    <>
      <Seo title={t('seo.tutorials_title')} description={t('seo.tutorials_desc')} canonical={`/${lang}/tutorials`} />
      <Header />
      <main id="main-content" className="max-w-4xl mx-auto px-4 py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">
          {t('seo.tutorials_title')}
        </h1>
        {items.length === 0 ? (
          <p className="text-slate-400">{t('tutorials.coming_soon')}</p>
        ) : (
          <div className="grid gap-6">
            {items.map((item) => (
              <Link
                key={item.slug}
                to={`/${lang}/tutorials/${item.slug}`}
                className="block p-6 bg-surface-800 rounded-xl border border-surface-700/50 hover:border-accent-500/30 transition-all"
              >
                <h2 className="text-xl font-semibold text-white mb-2">{item.title}</h2>
                <p className="text-slate-400 text-sm">{item.description}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
