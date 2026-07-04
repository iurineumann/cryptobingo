import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

export default function TutorialsIndex() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const lang = locale || 'en';

  return (
    <>
      <Seo title={t('seo.tutorials_title')} description={t('seo.tutorials_desc')} canonical={`/${lang}/tutorials`} />
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">
          {t('seo.tutorials_title')}
        </h1>
        <p className="text-slate-400">{t('tutorials.coming_soon')}</p>
      </main>
      <Footer />
    </>
  );
}
