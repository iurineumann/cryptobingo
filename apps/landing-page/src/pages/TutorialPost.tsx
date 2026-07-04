import { useTranslation } from 'react-i18next';
import { Link, useLoaderData, useParams } from 'react-router-dom';
import { loadTutorialPost } from '../../lib/content';
import type { TutorialItem } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

export async function loader({ params }: { params: { locale?: string; slug: string } }): Promise<TutorialItem | null> {
  const locale = params.locale || 'en';
  return loadTutorialPost(params.slug, locale);
}

export default function TutorialPost() {
  const { t } = useTranslation();
  const post = useLoaderData<typeof loader>();
  const { locale, slug } = useParams();
  const lang = locale || 'en';

  if (!post) {
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

  return (
    <>
      <Seo title={post.title} description={post.description} canonical={`/${lang}/tutorials/${slug}`} />
      <Header />
      <main id="main-content" className="max-w-3xl mx-auto px-4 py-20">
        <Link
          to={`/${lang}/tutorials`}
          className="inline-flex items-center text-sm text-accent-400 hover:text-accent-300 mb-6 transition-colors"
        >
          ← {t('tutorials.back')}
        </Link>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">{post.title}</h1>
        <p className="text-slate-400 mb-8">{post.description}</p>
        <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed">
          <div dangerouslySetInnerHTML={{ __html: post.body }} />
        </div>
      </main>
      <Footer />
    </>
  );
}
