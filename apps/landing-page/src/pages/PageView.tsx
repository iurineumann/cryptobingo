import { useTranslation } from 'react-i18next';
import { useParams, useLoaderData } from 'react-router-dom';
import { loadPageContent } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

interface PageData {
  title: string;
  description: string;
  body: string;
}

export async function loader({ params }: { params: { locale?: string; slug: string } }): Promise<PageData | null> {
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
        <main className="max-w-3xl mx-auto px-4 py-20">
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
      <main className="max-w-3xl mx-auto px-4 py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">{page.title}</h1>
        <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: page.body }} />
      </main>
      <Footer />
    </>
  );
}
